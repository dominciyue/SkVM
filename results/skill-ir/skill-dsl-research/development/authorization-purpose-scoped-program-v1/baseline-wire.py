"""Read-only BM wire measurement. Never dispatches inference or copies raw logs."""
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
BM = BASE.parent / 'authorization-branch-verified-consumption-v1'
REPO = BASE.parents[4]
def size(value):
    return len(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))

def main():
    rows = []
    for attempt in json.loads((BM / 'attempts.json').read_text(encoding='utf-8')):
        if attempt['position'] not in ['C0', 'B0']:
            continue
        raw_file = REPO / attempt['session'] / 'raw/account-turn-1.json'
        raw = json.loads(raw_file.read_text(encoding='utf-8'))
        clients = [e for e in raw['events'] if e.get('direction') == 'client']
        start = next(e['params'] for e in clients if e.get('method') == 'thread/start')
        prompt = next(e['params']['input'] for e in clients if e.get('method') == 'turn/start')
        replies = [e['result']['contentItems'] for e in clients if 'contentItems' in e.get('result', {})]
        contexts = []
        for items in replies:
            for item in items:
                try:
                    contexts.append(json.loads(item.get('text', '{}')).get('currentContext', {}))
                except (ValueError, AttributeError):
                    pass
        final_turns = []
        for file in sorted(raw_file.parent.glob('account-turn-*.json')):
            turn = json.loads(file.read_text(encoding='utf-8'))
            for event in turn['events']:
                if event.get('direction') == 'client' and event.get('method') == 'thread/start' and event['params'].get('dynamicTools') == []:
                    sent = next(e['params']['input'] for e in turn['events'] if e.get('direction') == 'client' and e.get('method') == 'turn/start')
                    final_turns.append({'raw': file.name, 'inputBytes': size(sent), 'tools': 0})
        rows.append({'purpose': attempt['position'], 'raw': str(raw_file.relative_to(REPO)).replace('\\', '/'),
                     'tools': {'count': len(start['dynamicTools']), 'bytes': size(start['dynamicTools']), 'names': [t['name'] for t in start['dynamicTools']]},
                     'initialInputBytes': size(prompt), 'toolReplies': len(replies), 'contentItemsBytes': sum(map(size, replies)),
                     'sourceIndexBytes': sum(size(c['sourceIndex']) for c in contexts if 'sourceIndex' in c),
                     'sourceWindowsBytes': sum(size(c['sourceWindows']) for c in contexts if 'sourceWindows' in c),
                     'finalChildren': final_turns})
    result = {'basis': 'BM actual client wire; server mirrors excluded', 'exactComponentTokens': None,
              'hypothesis': 'Directed purposes remove implicit property construction; evidence index growth transmits new/removed IDs only, while exact source remains retrievable.',
              'failureCriterion': 'Unchanged evidence produces a growing full directory or repeated window set; real benefit requires registered same-epoch serial pairs.', 'rows': rows}
    (BASE / 'baseline-wire.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    main()
