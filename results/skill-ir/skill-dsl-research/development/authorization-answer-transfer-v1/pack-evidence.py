"""Lossless evidence publication; retain all originals and verify every member.

pack runs once after all attempts close. verify/unpack also work from the
published 64 MiB parts. Unpack never overwrites a different local file.
"""
import hashlib
import json
import shutil
import sys
import tarfile
from pathlib import Path

base = Path(__file__).resolve().parent
archive_path = base / 'archives/full-evidence.tar.gz'
manifest_path = base / 'verification/evidence-bundle.json'
patterns = ['runs/**/*', 'authoring/*-process.json', 'authoring/*-proposals.json',
            'verification/*-archive/**/*', 'verification/ordinary-cli/**/*',
            'verification/portable-copy*/**/*']

def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def verify_sources(unpack=False):
    manifest = json.loads((base / 'verification/registered-source-bundle.json').read_text(encoding='utf-8'))
    source_archive = base / manifest['archive']
    assert digest(source_archive) == manifest['sha256']
    repo = base.parents[4]
    allowed = (repo / manifest['allowedSourceRoot']).resolve()
    assert allowed.is_relative_to(repo)
    with tarfile.open(source_archive, 'r:gz') as archive:
        assert archive.getnames() == [row['path'] for row in manifest['files']]
        for row in manifest['files']:
            member = archive.getmember(row['path'])
            assert member.isfile()
            assert hashlib.file_digest(archive.extractfile(member), 'sha256').hexdigest() == row['sha256']
            target = (repo / row['path']).resolve()
            assert target.is_relative_to(allowed), row['path']
            if unpack:
                if target.exists():
                    assert digest(target) == row['sha256'], 'Refuse to overwrite changed source: ' + row['path']
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with target.open('xb') as output, archive.extractfile(member) as source:
                        shutil.copyfileobj(source, output)
    return len(manifest['files'])

def verify(manifest, unpack=False):
    combined = hashlib.sha256()
    for part in manifest['parts']:
        file = base / part['path']
        assert digest(file) == part['sha256'], part['path']
        with file.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                combined.update(chunk)
    assert combined.hexdigest() == manifest['archiveSha256']
    if not archive_path.exists():
        with archive_path.open('xb') as target:
            for part in manifest['parts']:
                with (base / part['path']).open('rb') as source:
                    shutil.copyfileobj(source, target)
    assert digest(archive_path) == manifest['archiveSha256']
    with tarfile.open(archive_path, 'r:gz') as archive:
        assert archive.getnames() == [row['path'] for row in manifest['files']]
        for row in manifest['files']:
            member = archive.getmember(row['path'])
            assert member.isfile(), row['path']
            stream = archive.extractfile(member)
            assert stream is not None
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256'], row['path']
            if unpack:
                target = (base / row['path']).resolve()
                assert target.is_relative_to(base), row['path']
                if target.exists():
                    assert digest(target) == row['sha256'], 'Refuse to overwrite changed local evidence: ' + row['path']
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with target.open('xb') as output, archive.extractfile(member) as source:
                        shutil.copyfileobj(source, output)

command = sys.argv[1] if len(sys.argv) > 1 else 'verify'
if command == 'pack':
    ledger = json.loads((base / 'attempts.json').read_text(encoding='utf-8'))
    assert all(e['status'] not in ('running', 'unknown') and e.get('lifecycle', {}).get('localExecution') == 'closed' for e in ledger)
    assert not archive_path.exists() and not manifest_path.exists(), 'Evidence pack already exists; verify instead'
    files = sorted({p for pattern in patterns for p in base.glob(pattern) if p.is_file()})
    assert not any(p.is_symlink() for p in files)
    rows = [{'path': p.relative_to(base).as_posix(), 'bytes': p.stat().st_size, 'sha256': digest(p)} for p in files]
    archive_path.parent.mkdir(exist_ok=True)
    with tarfile.open(archive_path, 'w:gz', compresslevel=6) as archive:
        for p in files:
            archive.add(p, arcname=p.relative_to(base).as_posix(), recursive=False)
    parts = []
    with archive_path.open('rb') as archive:
        for number, chunk in enumerate(iter(lambda: archive.read(64 * 1024 * 1024), b''), 1):
            file = archive_path.with_name(f'full-evidence.tar.gz.part{number:03}')
            with file.open('xb') as part:
                part.write(chunk)
            parts.append({'path': file.relative_to(base).as_posix(), 'bytes': len(chunk), 'sha256': hashlib.sha256(chunk).hexdigest()})
    manifest = {'schemaVersion': 'br-lossless-evidence/v1', 'archiveSha256': digest(archive_path), 'archiveBytes': archive_path.stat().st_size, 'parts': parts, 'files': rows, 'originalsRetainedLocally': True, 'losslessReadbackVerified': False}
    verify(manifest)
    manifest['losslessReadbackVerified'] = True
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
elif command in ('verify', 'unpack'):
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    verify(manifest, command == 'unpack')
    verify_sources(command == 'unpack')
elif command == 'verify-sources':
    print(json.dumps({'registeredSourceFilesVerified': verify_sources()}))
    sys.exit(0)
else:
    raise ValueError('pack|verify|unpack|verify-sources')
print(json.dumps({'command': command, 'files': len(manifest['files']), 'archiveBytes': manifest['archiveBytes'], 'parts': len(manifest['parts']), 'losslessReadbackVerified': True}))
