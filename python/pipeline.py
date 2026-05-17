"""Pipeline — orchestrates the full Parse → Translate → Rebuild workflow.

New architecture (PDF path):
  PDF ──pdf2docx──► DOCX ──python-docx──► DocumentModel ──► Translate ──► Rebuild DOCX ──► PDF

New architecture (DOCX path):
  DOCX ──python-docx──► DocumentModel ──► Translate ──► Rebuild DOCX

Usage:
    from pipeline import TranslationPipeline

    pipeline = TranslationPipeline()
    result = pipeline.run(
        input_path='document.pdf',
        output_path='document_cn.pdf',
        engine='deepseek',
        api_key='sk-...',
        style='business',
    )
"""

import os
import sys
import time
import logging

logger = logging.getLogger(__name__)


class TranslationPipeline:
    def __init__(self):
        self._word_parser = None
        self._pdf_parser = None
        self._translator = None
        self._word_rebuilder = None
        self._pdf_rebuilder = None

    @property
    def word_parser(self):
        if self._word_parser is None:
            from parsers.word_parser import WordParser
            self._word_parser = WordParser()
        return self._word_parser

    @property
    def pdf_parser(self):
        if self._pdf_parser is None:
            from parsers.pdf_parser import PDFParser
            self._pdf_parser = PDFParser()
        return self._pdf_parser

    @property
    def translator(self):
        if self._translator is None:
            from translators.engine import TranslationEngine
            self._translator = TranslationEngine()
        return self._translator

    @property
    def word_rebuilder(self):
        if self._word_rebuilder is None:
            from rebuilders.word_rebuilder import WordRebuilder
            self._word_rebuilder = WordRebuilder()
        return self._word_rebuilder

    @property
    def pdf_rebuilder(self):
        if self._pdf_rebuilder is None:
            from rebuilders.pdf_rebuilder import PDFRebuilder
            self._pdf_rebuilder = PDFRebuilder()
        return self._pdf_rebuilder

    def run(self, input_path: str, output_path: str,
            engine: str = 'deepseek', api_key: str = '',
            style: str = 'business', term_tables=None,
            output_format: str = 'auto',
            progress_callback=None) -> dict:
        """Run the full translation pipeline.

        Args:
            input_path: Path to the source document (.pdf or .docx).
            output_path: Path for the output file.
            engine: Translation engine identifier.
            api_key: LLM API key.
            style: Translation style (academic/business/casual).
            term_tables: Terminology tables for the translator.
            output_format: 'auto' (same as input), 'docx', or 'pdf'.
            progress_callback: callable(percent, stage) for progress updates.

        Returns:
            dict with keys: outputPath, sourceFormat, outputFormat, pages, translatedItems
        """
        start_time = time.time()
        input_path = os.path.abspath(input_path)
        if not os.path.exists(input_path):
            raise FileNotFoundError(f'输入文件不存在: {input_path}')

        # Determine format
        ext = os.path.splitext(input_path)[1].lower()
        source_format = 'pdf' if ext == '.pdf' else 'docx'
        if output_format == 'auto':
            output_format = source_format

        logger.info('═══ 翻译管道启动 ═══')
        logger.info('输入: %s (格式: %s)', input_path, source_format)
        logger.info('输出: %s (格式: %s)', output_path, output_format)
        logger.info('引擎: %s, 风格: %s', engine, style)

        # ── Step 1: Parse ─────────────────────────────────────────────
        if progress_callback:
            progress_callback(0, '正在解析文档...')

        logger.info('─── Step 1: 解析文档 ───')
        doc_model = self._parse(input_path, source_format)
        pages = len(doc_model.get('pages', []))
        blocks = sum(len(p.get('blocks', [])) for p in doc_model.get('pages', []))
        tables = sum(len(p.get('tables', [])) for p in doc_model.get('pages', []))
        logger.info('解析结果: %d 页, %d 段落, %d 表格', pages, blocks, tables)

        if progress_callback:
            progress_callback(10, f'解析完成: {blocks} 段落, {tables} 表格')

        # ── Step 2: Translate ─────────────────────────────────────────
        logger.info('─── Step 2: 翻译 ───')

        def translate_progress(percent, stage):
            # Map 0-100 from translator to 10-80 in pipeline
            mapped = 10 + int(percent * 0.7)
            if progress_callback:
                progress_callback(mapped, stage)

        doc_model = self.translator.translate_document(
            doc_model,
            style=style,
            term_tables=term_tables,
            api_key=api_key,
            engine=engine,
            progress_callback=translate_progress,
        )

        translated_count = len(doc_model.get('translations', {}))
        logger.info('翻译完成: %d 项已翻译', translated_count)

        if progress_callback:
            progress_callback(80, f'翻译完成: {translated_count} 项')

        # ── Step 3: Rebuild ───────────────────────────────────────────
        logger.info('─── Step 3: 重建文档 ───')
        if progress_callback:
            progress_callback(85, '正在重建文档...')

        translated_docx_path = None

        if output_format == 'pdf' and source_format == 'pdf':
            # PDF → DOCX → Translate → DOCX → PDF
            translated_docx_path = self._rebuild_docx(
                doc_model, output_path, input_path
            )
            self._rebuild_pdf(
                doc_model, output_path, input_path,
                translated_docx_path=translated_docx_path,
            )
        elif output_format == 'docx':
            # Direct DOCX rebuild
            self._rebuild_docx(doc_model, output_path, input_path)
        elif output_format == 'pdf' and source_format == 'docx':
            # DOCX → Translate → DOCX → PDF
            translated_docx_path = self._rebuild_docx(
                doc_model, output_path, input_path
            )
            self._rebuild_pdf(
                doc_model, output_path, input_path,
                translated_docx_path=translated_docx_path,
            )
        else:
            self._rebuild_docx(doc_model, output_path, input_path)

        elapsed = time.time() - start_time
        logger.info('═══ 翻译管道完成 (耗时 %.1f 秒) ═══', elapsed)

        if progress_callback:
            progress_callback(100, '翻译完成!')

        return {
            'outputPath': output_path,
            'sourceFormat': source_format,
            'outputFormat': output_format,
            'pages': pages,
            'translatedItems': translated_count,
            'elapsedSeconds': round(elapsed, 1),
        }

    def _parse(self, input_path: str, source_format: str) -> dict:
        if source_format == 'pdf':
            return self.pdf_parser.parse(input_path)
        return self.word_parser.parse(input_path)

    def _rebuild_docx(self, doc_model: dict, output_path: str,
                      source_path: str) -> str:
        """Build translated DOCX, return the output path."""
        if output_path.lower().endswith('.pdf'):
            # Need intermediate DOCX path
            base = os.path.splitext(output_path)[0]
            docx_path = base + '_translated.docx'
        else:
            docx_path = output_path

        self.word_rebuilder.rebuild(
            doc_model,
            docx_path,
            source_path=self._resolve_rebuild_source_path(doc_model, source_path),
        )
        return docx_path

    def _rebuild_pdf(self, doc_model: dict, output_path: str,
                     source_path: str, translated_docx_path: str = None):
        """Build translated PDF from the translated DOCX."""
        self.pdf_rebuilder.rebuild(
            doc_model, output_path,
            source_path=self._resolve_rebuild_source_path(doc_model, source_path),
            translated_docx_path=translated_docx_path,
        )

    @staticmethod
    def _resolve_rebuild_source_path(doc_model: dict, source_path: str) -> str:
        converted_docx = doc_model.get('meta', {}).get('convertedDocx', '')
        if converted_docx and os.path.exists(converted_docx):
            return converted_docx
        return source_path
