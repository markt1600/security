"""Add local face highlights to the latest finalized clips without changing videos."""
import argparse
import json
from pathlib import Path
from faces import extract_faces, ANALYSIS_VERSION

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', default='C:/Users/markh/Documents/Codex/CameraMonitor/recordings')
    args = parser.parse_args()
    events = []
    for path in Path(args.directory).rglob('*.event.json'):
        data = json.loads(path.read_text(encoding='utf-8'))
        events.append((data['detectedAt'], path, data))
    for _, path, data in sorted(events, reverse=True)[:10]:
        if data.get('analysisVersion') == ANALYSIS_VERSION and data.get('faceAnalysis') == 'complete':
            continue
        base = str(path)[:-len('.event.json')]
        try:
            data.update(extract_faces(base + '.mp4', base))
            temporary = Path(base + '.event.tmp')
            temporary.write_text(json.dumps(data), encoding='utf-8')
            temporary.replace(path)
            print(f"{path.name}: {len(data['faces'])} face highlights", flush=True)
        except Exception as error:
            print(f'{path.name}: failed ({type(error).__name__})', flush=True)
            raise
