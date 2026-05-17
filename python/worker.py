"""Python Worker — stdin/stdout JSON line-protocol entry point.

Commands:
  parse     — Parse a document into a DocumentModel
  translate — Translate a DocumentModel's text
  rebuild   — Rebuild a translated document
  pipeline  — Run the full parse→translate→rebuild pipeline
  test_connection — Verify an LLM API key and engine
  diagnostics — Check Python runtime and required dependencies
  ping      — Health check
"""

import sys
import os
import json
import logging
import traceback

# Configure logging to stderr (stdout is reserved for JSON protocol)
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] %(name)s: %(message)s',
    stream=sys.stderr,
)
logger = logging.getLogger('worker')

parsers = None
translators = None
rebuilders = None
pipeline = None


def _ensure_services():
    """Lazy-load document dependencies so diagnostics can run when deps are missing."""
    global parsers, translators, rebuilders, pipeline
    if parsers and translators and rebuilders and pipeline:
        return

    from parsers.word_parser import WordParser
    from parsers.pdf_parser import PDFParser
    from translators.engine import TranslationEngine
    from rebuilders.word_rebuilder import WordRebuilder
    from rebuilders.pdf_rebuilder import PDFRebuilder
    from pipeline import TranslationPipeline

    parsers = {
        'docx': WordParser(),
        'pdf': PDFParser(),
    }
    translators = TranslationEngine()
    rebuilders = {
        'docx': WordRebuilder(),
        'pdf': PDFRebuilder(),
    }
    pipeline = TranslationPipeline()


def handle_request(req: dict) -> str:
    command = req.get('command')
    payload = req.get('payload', {})
    req_id = req.get('id', '')
    logger.info('command=%s, payload_keys=%s', command, list(payload.keys()))

    try:
        if command == 'parse':
            return _handle_parse(req_id, payload)

        elif command == 'translate':
            return _handle_translate(req_id, payload)

        elif command == 'rebuild':
            return _handle_rebuild(req_id, payload)

        elif command == 'pipeline':
            return _handle_pipeline(req_id, payload)

        elif command == 'test_connection':
            return _handle_test_connection(req_id, payload)

        elif command == 'diagnostics':
            return success_response(req_id, _handle_diagnostics())

        elif command == 'ping':
            return success_response(req_id, 'pong')

        else:
            return error_response(req_id, 'UNKNOWN_COMMAND', f'未知命令: {command}')

    except Exception as e:
        logger.error('处理失败: %s\n%s', e, traceback.format_exc())
        return error_response(req_id, 'WORKER_ERROR', str(e), traceback.format_exc())


def _handle_parse(req_id: str, payload: dict) -> str:
    _ensure_services()
    fmt = payload.get('format', 'docx')
    parser = parsers.get(fmt)
    if not parser:
        return error_response(req_id, 'UNSUPPORTED_FORMAT', f'不支持的格式: {fmt}')
    result = parser.parse(payload['filePath'])
    return success_response(req_id, result)


def _handle_translate(req_id: str, payload: dict) -> str:
    _ensure_services()
    doc_model = payload['documentModel']
    style = payload.get('style', 'business')
    term_tables = payload.get('termTables', [])
    api_key = payload.get('apiKey', '')
    engine = payload.get('engine', 'deepseek')
    logger.info('translate: engine=%s, apiKey=%s',
                engine, '***' + api_key[-4:] if len(api_key) > 4 else '(empty)')

    def progress_cb(percent, stage):
        progress_data = json.dumps({
            'type': 'progress',
            'id': req_id,
            'percent': percent,
            'stage': stage,
        }, ensure_ascii=False)
        sys.stderr.write(f'PROGRESS:{progress_data}\n')
        sys.stderr.flush()

    result = translators.translate_document(
        doc_model, style, term_tables,
        api_key=api_key, engine=engine,
        progress_callback=progress_cb,
    )
    return success_response(req_id, result)


def _handle_rebuild(req_id: str, payload: dict) -> str:
    _ensure_services()
    doc_model = payload['documentModel']
    output_path = payload['outputPath']
    fmt = payload.get('format', 'docx')
    source_path = _resolve_rebuild_source_path(doc_model, payload.get('sourcePath', ''))
    translated_docx_path = payload.get('translatedDocxPath', '')

    rebuilder = rebuilders.get(fmt)
    if not rebuilder:
        return error_response(req_id, 'UNSUPPORTED_FORMAT', f'不支持的输出格式: {fmt}')

    kwargs = {'doc_model': doc_model, 'output_path': output_path}
    if source_path:
        kwargs['source_path'] = source_path
    if translated_docx_path and fmt == 'pdf':
        kwargs['translated_docx_path'] = translated_docx_path

    result = rebuilder.rebuild(**kwargs)
    return success_response(req_id, result)


def _resolve_rebuild_source_path(doc_model: dict, source_path: str) -> str:
    """Prefer the PDF->DOCX intermediate template when rebuilding output.

    PDF parsing is intentionally routed through pdf2docx first. Rebuilding from
    that converted DOCX preserves the flow layout far better than constructing a
    new document from the extracted model.
    """
    converted_docx = doc_model.get('meta', {}).get('convertedDocx', '')
    if converted_docx and os.path.exists(converted_docx):
        return converted_docx
    return source_path


def _handle_pipeline(req_id: str, payload: dict) -> str:
    """Run the full parse→translate→rebuild pipeline in one command."""
    _ensure_services()
    input_path = payload['inputPath']
    output_path = payload['outputPath']
    engine = payload.get('engine', 'deepseek')
    api_key = payload.get('apiKey', '')
    style = payload.get('style', 'business')
    term_tables = payload.get('termTables', [])
    output_format = payload.get('outputFormat', 'auto')

    def progress_cb(percent, stage):
        # Emit progress events via stderr for the Node.js wrapper to capture
        progress_data = json.dumps({
            'type': 'progress',
            'id': req_id,
            'percent': percent,
            'stage': stage,
        }, ensure_ascii=False)
        sys.stderr.write(f'PROGRESS:{progress_data}\n')
        sys.stderr.flush()

    result = pipeline.run(
        input_path=input_path,
        output_path=output_path,
        engine=engine,
        api_key=api_key,
        style=style,
        term_tables=term_tables,
        output_format=output_format,
        progress_callback=progress_cb,
    )
    return success_response(req_id, result)


def _handle_test_connection(req_id: str, payload: dict) -> str:
    _ensure_services()
    api_key = payload.get('apiKey', '')
    engine = payload.get('engine', 'kimi')
    result = translators.test_connection(api_key=api_key, engine=engine)
    return success_response(req_id, result)


def _handle_diagnostics() -> dict:
    deps = ['fitz', 'pdfplumber', 'docx', 'reportlab', 'pdf2docx']
    dependency_status = {}
    for name in deps:
        try:
            __import__(name)
            dependency_status[name] = True
        except Exception:
            dependency_status[name] = False

    font_status = []
    try:
        from rebuilders.pdf_rebuilder import get_cjk_font_candidates
        for name, path in get_cjk_font_candidates():
            font_status.append({
                'name': name,
                'path': os.path.abspath(path),
                'exists': os.path.exists(path),
            })
    except Exception as e:
        font_status.append({'name': 'diagnostics-error', 'path': str(e), 'exists': False})

    return {
        'python': sys.version.split()[0],
        'executable': sys.executable,
        'cwd': os.getcwd(),
        'resourcesPath': os.environ.get('ENGLISH_TO_CHINA_RESOURCES', ''),
        'dependencies': dependency_status,
        'fonts': font_status,
    }


def success_response(req_id: str, data) -> str:
    return json.dumps({'id': req_id, 'status': 'success', 'data': data}, ensure_ascii=False)


def error_response(req_id: str, code: str, message: str, detail: str = '') -> str:
    return json.dumps({
        'id': req_id,
        'status': 'error',
        'error': {'code': code, 'message': message, 'detail': detail}
    }, ensure_ascii=False)


def main():
    logger.info('Worker 启动，等待命令...')
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            resp = handle_request(req)
            sys.stdout.write(resp + '\n')
            sys.stdout.flush()
        except json.JSONDecodeError:
            resp = error_response('', 'INVALID_JSON', '无效的 JSON 输入')
            sys.stdout.write(resp + '\n')
            sys.stdout.flush()


if __name__ == '__main__':
    main()
