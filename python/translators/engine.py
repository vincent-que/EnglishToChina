"""Translation Engine — calls LLM APIs (6 Chinese providers) via urllib.

Supports:
- 6 OpenAI-compatible Chinese LLM providers
- Text segmentation for long content (>2000 tokens)
- Batch translation with progress callbacks
- Retry with exponential backoff
- Table cell skip logic (numbers, formulas, units)
"""

import json
import os
import re
import sys
import time
import logging
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)

STYLE_PROMPTS = {
    'academic': '你是一位专业的学术翻译专家。请将以下英文翻译为正式的学术中文，用词严谨，句式规范。',
    'business': '你是一位专业的商务翻译专家。请将以下英文翻译为商务中文，专业但不生硬，适合商务场景。',
    'casual': '你是一位翻译专家。请将以下英文翻译为通俗易懂的中文，自然流畅，适合日常阅读。',
}

ENGINE_CONFIGS = {
    'deepseek':    {'base_url': 'https://api.deepseek.com/v1',                    'model': 'deepseek-chat'},
    'qwen':        {'base_url': 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'model': 'qwen-plus'},
    'glm':         {'base_url': 'https://open.bigmodel.cn/api/paas/v4',           'model': 'glm-4-flash'},
    'moonshot':    {'base_url': 'https://api.moonshot.cn/v1',                      'model': 'moonshot-v1-8k'},
    'kimi':        {'base_url': 'https://api.moonshot.cn/v1',                      'model': 'moonshot-v1-8k'},
    'baichuan':    {'base_url': 'https://api.baichuan-ai.com/v1',                  'model': 'Baichuan4'},
    'siliconflow': {'base_url': 'https://api.siliconflow.cn/v1',                   'model': 'deepseek-ai/DeepSeek-V3'},
}

# Max tokens before we segment text
_MAX_SEGMENT_TOKENS = 2000
# Overlap between segments (in characters) for context continuity
_SEGMENT_OVERLAP = 100
# Max retries per API call
_MAX_RETRIES = 3
# Base delay for exponential backoff (seconds)
_RETRY_BASE_DELAY = 2

# Regex: text that should NOT be translated (pure numbers, formulas, symbols)
_SKIP_NUMBERS = re.compile(
    r'^[\s\d\.\,\;\:\-\+\*\/\=\%\$\¥\€\£\(\)\[\]'
    r'\+\-\*\/\=\>\<\≤\≥\≠\≈°℃℉µμΩ]+$'
)


class TranslationEngine:
    def translate_document(self, doc_model: dict, style: str = 'business',
                           term_tables=None, api_key: str = '',
                           engine: str = 'deepseek',
                           progress_callback=None) -> dict:
        """Translate all blocks and table cells in a DocumentModel.

        Args:
            doc_model: The parsed document model.
            style: Translation style (academic/business/casual).
            term_tables: List of terminology table names or dict.
            api_key: LLM API key.
            engine: Engine identifier (deepseek/qwen/glm/moonshot/baichuan/siliconflow).
            progress_callback: Optional callable(percent, stage) for progress updates.

        Returns:
            The same doc_model with translations dict populated.
        """
        if not api_key:
            api_key = os.environ.get('TRANSLATE_API_KEY', '')
        if not engine or engine == 'auto':
            engine = os.environ.get('TRANSLATE_ENGINE', 'deepseek')

        if not api_key:
            logger.warning('未提供 API Key，跳过翻译')
            return doc_model

        system_prompt = self._build_system_prompt(style, term_tables)

        # Count total items for progress
        total_items = 0
        for page in doc_model.get('pages', []):
            total_items += sum(1 for b in page.get('blocks', []) if b.get('text', '').strip())
            for table in page.get('tables', []):
                for row in table.get('cells', []):
                    for cell in row:
                        text = cell.get('text', '').strip()
                        if text and not self._is_skip_text(text):
                            total_items += 1

        translated_count = 0

        for page in doc_model.get('pages', []):
            # Translate paragraph blocks
            for block in page.get('blocks', []):
                text = block.get('text', '')
                if not text.strip():
                    continue
                if block.get('id') in doc_model.get('translations', {}):
                    translated_count += 1
                    continue

                translated = self._translate_with_segmentation(
                    text, system_prompt, api_key, engine
                )
                doc_model['translations'][block['id']] = translated
                translated_count += 1

                if progress_callback and total_items > 0:
                    progress_callback(
                        int(translated_count / total_items * 100),
                        f'翻译段落 ({translated_count}/{total_items})'
                    )

            # Translate table cells
            for table in page.get('tables', []):
                table_id = table.get('id', '')
                for row_idx, row in enumerate(table.get('cells', [])):
                    for col_idx, cell in enumerate(row):
                        text = cell.get('text', '').strip()
                        if not text or self._is_skip_text(text):
                            continue

                        cell_key = f"{table_id}_r{row_idx}_c{col_idx}"
                        if cell_key in doc_model.get('translations', {}):
                            translated_count += 1
                            continue

                        translated = self._translate_with_segmentation(
                            text, system_prompt, api_key, engine
                        )
                        doc_model['translations'][cell_key] = translated
                        translated_count += 1

                        if progress_callback and total_items > 0:
                            progress_callback(
                                int(translated_count / total_items * 100),
                                f'翻译表格 ({translated_count}/{total_items})'
                            )

        logger.info('翻译完成: 共 %d 项', translated_count)
        return doc_model

    def translate_text(self, text: str, system_prompt: str,
                       api_key: str, engine: str) -> str:
        """Public entry point for single-text translation (used by pipeline)."""
        return self._translate_with_retry(text, system_prompt, api_key, engine)

    def test_connection(self, api_key: str, engine: str = 'kimi') -> dict:
        """Verify that the configured OpenAI-compatible endpoint is reachable."""
        if not api_key:
            return {'success': False, 'message': '请先填写 API Key'}
        try:
            result = self._call_llm_api(
                'Connection test',
                '请把用户给出的英文短语翻译为简体中文，只返回译文。',
                api_key,
                engine or 'kimi',
            )
            if not result.strip():
                return {'success': False, 'message': '接口返回为空'}
            return {'success': True, 'message': '连接成功'}
        except Exception as exc:
            logger.warning('连接测试失败: %s', exc)
            return {'success': False, 'message': f'连接失败: {exc}'}

    # ── Internal helpers ──────────────────────────────────────────────

    def _translate_with_segmentation(self, text: str, system_prompt: str,
                                     api_key: str, engine: str) -> str:
        """Translate text, segmenting if it exceeds token limit."""
        if not text.strip():
            return text

        # Rough token estimate: 1 token ≈ 1.5 chars for English, 1 char for Chinese
        estimated_tokens = len(text) // 1.5
        if estimated_tokens <= _MAX_SEGMENT_TOKENS:
            return self._translate_with_retry(text, system_prompt, api_key, engine)

        # Segment by sentences
        segments = self._segment_text(text)
        logger.info('长文本分段翻译: %d 字符 → %d 段', len(text), len(segments))

        translated_parts = []
        for i, seg in enumerate(segments):
            if not seg.strip():
                continue
            part = self._translate_with_retry(seg, system_prompt, api_key, engine)
            translated_parts.append(part)
            logger.debug('段 %d/%d 翻译完成', i + 1, len(segments))

        return ''.join(translated_parts)

    def _segment_text(self, text: str) -> list:
        """Split text into segments ≤1500 tokens, with overlap at sentence boundaries."""
        # Split on sentence boundaries
        sentences = re.split(r'(?<=[.!?])\s+', text)
        segments = []
        current = ''
        max_chars = int(_MAX_SEGMENT_TOKENS * 1.5)  # Convert tokens to chars

        for sentence in sentences:
            if len(current) + len(sentence) > max_chars and current:
                segments.append(current.strip())
                # Keep overlap from end of previous segment
                overlap = current[-_SEGMENT_OVERLAP:] if len(current) > _SEGMENT_OVERLAP else current
                current = overlap + ' ' + sentence
            else:
                current = (current + ' ' + sentence).strip() if current else sentence

        if current.strip():
            segments.append(current.strip())

        return segments if segments else [text]

    def _translate_with_retry(self, text: str, system_prompt: str,
                              api_key: str, engine: str) -> str:
        """Translate with exponential backoff retry."""
        last_error = None
        for attempt in range(_MAX_RETRIES):
            try:
                return self._call_llm_api(text, system_prompt, api_key, engine)
            except (urllib.error.URLError, urllib.error.HTTPError,
                    KeyError, TimeoutError, RuntimeError) as e:
                last_error = e
                delay = _RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning('翻译失败 (尝试 %d/%d), %s 秒后重试: %s',
                               attempt + 1, _MAX_RETRIES, delay, e)
                time.sleep(delay)

        logger.error('翻译最终失败: %s', last_error)
        raise RuntimeError(f'翻译失败: {last_error}')

    def _call_llm_api(self, text: str, system_prompt: str,
                      api_key: str, engine: str) -> str:
        """Make a single LLM API call."""
        config = ENGINE_CONFIGS.get(engine, ENGINE_CONFIGS['deepseek'])
        url = f"{config['base_url']}/chat/completions"

        payload = json.dumps({
            'model': config['model'],
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {
                    'role': 'user',
                    'content': (
                        '请将 <text> 标签内的内容翻译成简体中文。'
                        '保留数字、金额、型号、邮箱、网址和专有代码，不要解释，不要复述原文。\n'
                        f'<text>{text}</text>'
                    ),
                },
            ],
            'temperature': 0.3,
            'max_tokens': 4096,
        }).encode('utf-8')

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
            method='POST',
        )

        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            result = data['choices'][0]['message']['content']
            result = self._clean_translation_result(result)
            logger.debug('翻译: %s... → %s...', text[:40], result[:40])
            return result

    @staticmethod
    def _clean_translation_result(result: str) -> str:
        result = result.strip()
        result = re.sub(r'^```(?:\w+)?\s*|\s*```$', '', result).strip()
        match = re.fullmatch(r'<text>\s*(.*?)\s*</text>', result, flags=re.DOTALL | re.IGNORECASE)
        if match:
            return match.group(1).strip()
        return result

    def _build_system_prompt(self, style: str, term_tables) -> str:
        base = STYLE_PROMPTS.get(style, STYLE_PROMPTS['business'])
        terms = self._format_term_tables(term_tables)
        if terms:
            base += (
                '\n必须严格遵守以下术语表。遇到左侧英文时，优先翻译为右侧中文：\n'
                f'{terms}'
            )
        base += '\n请只返回中文翻译结果，不要添加解释、前后缀或额外内容。'
        return base

    @staticmethod
    def _format_term_tables(term_tables) -> str:
        if not term_tables:
            return ''

        entries = []
        if isinstance(term_tables, list):
            for table in term_tables:
                if isinstance(table, dict) and isinstance(table.get('entries'), list):
                    for entry in table.get('entries', []):
                        if isinstance(entry, dict):
                            source = str(entry.get('source', '')).strip()
                            target = str(entry.get('target', '')).strip()
                            if source and target:
                                entries.append(f'- {source} => {target}')
                elif isinstance(table, dict):
                    source = str(table.get('source', '')).strip()
                    target = str(table.get('target', '')).strip()
                    if source and target:
                        entries.append(f'- {source} => {target}')
                elif isinstance(table, str) and '=>' in table:
                    entries.append(f'- {table.strip()}')
        elif isinstance(term_tables, dict):
            for source, target in term_tables.items():
                entries.append(f'- {source} => {target}')

        return '\n'.join(entries[:500])

    @staticmethod
    def _is_skip_text(text: str) -> bool:
        """Check if text should be skipped (numbers, formulas, units)."""
        stripped = text.strip()
        if not stripped:
            return True
        # Pure numbers/symbols/formulas (no letters at all)
        if _SKIP_NUMBERS.match(stripped):
            return True
        # Very short unit abbreviations: "USD", "kg", "°C", "No."
        if len(stripped) <= 3 and not any(c.islower() for c in stripped):
            return True
        return False
