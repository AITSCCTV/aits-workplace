"""Import a complete private Sites export without overwriting destination records.

Dry run by default. Uses the existing Wrangler login in memory, never prints credentials.
Backups and verification receipts are written under ignored private-data/.
"""
import argparse, datetime, hashlib, json, pathlib, re, urllib.request

TABLES = {
    'tasks': ['id', 'data', 'revision', 'updated'],
    'events': ['id', 'task_id', 'data', 'at'],
    'progress_projects': ['id', 'data', 'revision', 'updated'],
    'progress_history': ['id', 'project_id', 'revision', 'data', 'at'],
    'service_records': ['id', 'data', 'revision', 'updated'],
    'warranties': ['id', 'data', 'revision', 'updated'],
}

def canonical(row):
    row = dict(row)
    if 'data' in row: row['data'] = json.loads(row['data'])
    return json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def validate(data):
    if data.get('format') != 'aits-private-migration-v1' or set(data['tables']) != set(TABLES):
        raise ValueError('A complete migration export is required')
    for table, columns in TABLES.items():
        rows = data['tables'][table]
        if len({r['id'] for r in rows}) != len(rows): raise ValueError('Duplicate IDs: '+table)
        for row in rows:
            if set(row) != set(columns): raise ValueError('Unexpected columns: '+table)
            if '[truncated for model]' in str(row): raise ValueError('Truncated export')
            canonical(row)
    for history, parent, key in [('events','tasks','task_id'),('progress_history','progress_projects','project_id')]:
        ids = {r['id'] for r in data['tables'][parent]}
        if any(r[key] not in ids for r in data['tables'][history]): raise ValueError('Orphan history: '+history)

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('export'); parser.add_argument('--apply',action='store_true'); args=parser.parse_args()
    root=pathlib.Path(__file__).resolve().parents[1]
    source=pathlib.Path(args.export).read_bytes(); data=json.loads(source); validate(data)
    conf=json.loads((root/'backend/wrangler.jsonc').read_text())
    db=next(d['database_id'] for d in conf['d1_databases'] if d['binding']=='DB_PROJECT_BOARD')
    credential=(pathlib.Path.home()/'AppData/Roaming/xdg.config/.wrangler/config/default.toml').read_text()
    token=re.search(r'oauth_token\s*=\s*"([^"]+)"',credential).group(1)
    url=f"https://api.cloudflare.com/client/v4/accounts/{conf['account_id']}/d1/database/{db}/query"
    def query(sql,params=[]):
        request=urllib.request.Request(url,data=json.dumps({'sql':sql,'params':params}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
        with urllib.request.urlopen(request) as response: result=json.load(response)
        if not result.get('success') or any(not r.get('success') for r in result['result']): raise RuntimeError('Database request failed')
        return result['result'][0]['results']
    before={t:query('SELECT * FROM '+t+' ORDER BY id') for t in TABLES}
    pending={}; report={}
    for table, rows in data['tables'].items():
        existing={r['id']:r for r in before[table]}; pending[table]=[]
        for row in rows:
            if row['id'] in existing:
                if canonical(row)!=canonical(existing[row['id']]): raise ValueError('Destination conflict; no writes performed: '+table)
            else: pending[table].append(row)
        report[table]={'source':len(rows),'existing':len(existing),'toImport':len(pending[table])}
    if not args.apply: print(json.dumps({'dryRun':True,'tables':report})); return
    folder=root/'private-data/migration'; folder.mkdir(parents=True,exist_ok=True)
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    (folder/(stamp+'-before.json')).write_text(json.dumps(before,ensure_ascii=False),encoding='utf-8')
    for table,rows in pending.items():
        columns=TABLES[table]
        for row in rows:
            query('INSERT INTO '+table+' ('+','.join(columns)+') VALUES ('+','.join('?' for _ in columns)+') ON CONFLICT(id) DO NOTHING',[row[c] for c in columns])
    for table,rows in data['tables'].items():
        after={r['id']:r for r in query('SELECT * FROM '+table+' ORDER BY id')}
        if any(r['id'] not in after or canonical(r)!=canonical(after[r['id']]) for r in rows): raise RuntimeError('Read-back verification failed: '+table)
        report[table]['verified']=len(rows)
    receipt={'sourceSha256':hashlib.sha256(source).hexdigest(),'at':stamp,'tables':report}
    (folder/(stamp+'-verified.json')).write_text(json.dumps(receipt,indent=2),encoding='utf-8')
    print(json.dumps(receipt))

if __name__=='__main__': main()
