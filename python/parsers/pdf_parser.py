"""PDF Parser — converts PDF to DOCX first, then delegates to WordParser.

This is the core of the new architecture: instead of extracting text with
absolute coordinates (which breaks when Chinese text is longer/shorter),
we convert to DOCX which has flow-based layout that auto-adapts.
"""

import os
import sys
import logging
import tempfile

from pdf2docx import Converter

logger = logging.getLogger(__name__)


class PDFParser:
    def __init__(self):
        self._word_parser = None

    @property
    def word_parser(self):
        if self._word_parser is None:
            from parsers.word_parser import WordParser
            self._word_parser = WordParser()
        return self._word_parser

    def parse(self, file_path: str) -> dict:
        if not os.path.isabs(file_path):
            file_path = os.path.abspath(file_path)
        if not os.path.exists(file_path):
            raise FileNotFoundError(f'文件不存在: {file_path}')

        # Convert PDF → DOCX using pdf2docx
        docx_path = self._convert_pdf_to_docx(file_path)
        logger.info('PDF 转换完成: %s → %s', file_path, docx_path)

        try:
            # Parse the converted DOCX using WordParser
            doc_model = self.word_parser.parse(docx_path)
            # Tag the source format as pdf for downstream logic
            doc_model['meta']['format'] = 'pdf'
            doc_model['meta']['sourceFile'] = os.path.basename(file_path)
            # Store the intermediate DOCX path so rebuilder can use it
            doc_model['meta']['convertedDocx'] = docx_path
            return doc_model
        except Exception:
            # Clean up temp file on failure
            self._cleanup(docx_path)
            raise

    def _convert_pdf_to_docx(self, pdf_path: str) -> str:
        """Convert PDF to DOCX using pdf2docx.

        Returns the path to the generated DOCX file.
        The caller is responsible for cleanup.
        """
        # Output to same directory with .docx extension, or temp dir
        base = os.path.splitext(os.path.basename(pdf_path))[0]
        output_dir = tempfile.mkdtemp(prefix='etc_pdf2docx_')
        docx_path = os.path.join(output_dir, f'{base}.docx')

        logger.info('开始 PDF→DOCX 转换: %s', pdf_path)
        cv = Converter(pdf_path)
        try:
            cv.convert(docx_path)
        finally:
            cv.close()

        if not os.path.exists(docx_path):
            raise RuntimeError(f'PDF 转换失败，未生成 DOCX 文件: {docx_path}')

        file_size = os.path.getsize(docx_path)
        logger.info('PDF→DOCX 转换完成: %s (%.1f KB)', docx_path, file_size / 1024)
        return docx_path

    @staticmethod
    def _cleanup(docx_path: str):
        """Remove the intermediate DOCX and its temp directory."""
        try:
            if docx_path and os.path.exists(docx_path):
                os.remove(docx_path)
                temp_dir = os.path.dirname(docx_path)
                if os.path.isdir(temp_dir):
                    os.rmdir(temp_dir)
        except OSError:
            pass
