#!/usr/bin/env python3
"""Build the reviewed payload, then generate the unsigned XRI for CodeSign.

Signature files are checked for presence and XML structure only. Verify their
cryptographic validity with PixInsight before publishing. This tool never signs.
"""

import argparse
import base64
from datetime import datetime
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import xml.etree.ElementTree as ET
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED


ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'src/scripts/TheSpaceKoala/'
SIGNATURE_IDS = {
    'SendMessageToPhone': 'SendMessageToPhone',
    'NormalizeExposure': 'NormalizeExposureRegion',
    'CropImageToSize': 'CenterCrop2200',
}
NEW_SIGNATURES = {PREFIX + name + '.xsgn'
                  for name in ('NormalizeExposure', 'CropImageToSize')}
OWNED_ROOTS = (PREFIX, 'doc/scripts/SendMessageToPhone/',
               'doc/docs/Notification Event Script for WBPP/',
               'doc/docs/WBPP Multi Scope Stacker/',
               'doc/docs/WBPP No Code Pipeline Builder/')
OWNED_REMOVALS = {
    PREFIX + 'TelegramEventScript.js',
    PREFIX + 'TelegramEventScript.xsgn',
    PREFIX + 'SendImageToTelegram.js',
    PREFIX + 'SendImageToTelegram.xsgn',
    'doc/scripts/SendImageToTelegram',
    'doc/docs/WBPP Telegram Notification Event Script',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check_path(name):
    path = PurePosixPath(name)
    require(not path.is_absolute() and '..' not in path.parts
            and '\\' not in name and str(path) == name,
            'Unsafe archive path: ' + name)
    require(name.startswith(OWNED_ROOTS),
            'File is outside the reviewed product directories: ' + name)


def check_script_identifier(path, expected_id):
    text = path.read_text(encoding='utf-8-sig')
    identifiers = re.findall(
        r'^\s*#(?:feature-id|script-id)[ \t]+([A-Za-z_][A-Za-z_0-9]*)[ \t]*(?::|$)',
        text, re.MULTILINE)
    require(identifiers == [expected_id],
            'Missing or incorrect explicit script identifier: ' + str(path)
            + '. Use #feature-id ScriptIdentifier : Menu > Name.')


def check_signature(path, expected_id):
    root = ET.fromstring(path.read_bytes())
    ns = '{http://www.pixinsight.com/xsgn}'
    require(root.tag == ns + 'xsgn', 'Invalid XSGN root: ' + str(path))
    sig = root.find(ns + 'Signature')
    require(sig is not None, 'Missing XSGN Signature: ' + str(path))
    require(sig.get('scriptId') == expected_id, 'Wrong scriptId: ' + str(path))
    require(sig.get('developerId') == 'Luca Bartek',
            'Unexpected signing identity: ' + str(path))
    value = sig.find(ns + 'CodeSignature')
    require(value is not None and value.get('encoding') == 'Base64',
            'Missing CodeSignature: ' + str(path))
    decoded = base64.b64decode(''.join((value.text or '').split()), validate=True)
    require(len(decoded) == 64, 'Invalid Ed25519 signature length: ' + str(path))


def build(output, release_date, preview):
    date = datetime.strptime(release_date, '%Y%m%d')
    require(date.strftime('%Y%m%d') == release_date, 'Use YYYYMMDD release date')
    require(not (ROOT / 'doc/pidoc').exists(),
            'Reserved doc/pidoc tree has reappeared in the deployment source')
    for stem, script_id in SIGNATURE_IDS.items():
        check_script_identifier(ROOT / (PREFIX + stem + '.js'), script_id)
    files = json.loads((ROOT / 'release/package-files.json').read_text())
    require(len(files) == len(set(files)), 'Duplicate manifest entries')
    payload = {}
    missing = []
    for name in files:
        check_path(name)
        source = ROOT / name
        require(not source.is_symlink() and source.resolve().is_relative_to(ROOT),
                'Symlink or escaped source: ' + name)
        if not source.is_file():
            if preview and name in NEW_SIGNATURES:
                missing.append(name)
                continue
            raise ValueError('Required file missing: ' + name + '. Sign scripts before building the final release.')
        payload[name] = source.read_bytes()
    # Fail on unreviewed additions instead of silently dropping source files.
    for folder in ('src', 'doc'):
        for source in (ROOT / folder).rglob('*'):
            require(not source.is_symlink(), 'Symlink in deployment source: ' + str(source))
            if source.is_file():
                name = source.relative_to(ROOT).as_posix()
                if source.name == '.DS_Store':
                    continue  # Finder metadata is never installation payload.
                # These are repository-only items already excluded by the old package.
                if name == 'doc/forceSync' or name.startswith('doc/docs/WBPP Telegram Notification Event Script/'):
                    continue
                require(name in files, 'Unreviewed deployment source file: ' + name)
    for stem, script_id in SIGNATURE_IDS.items():
        name = PREFIX + stem + '.xsgn'
        if name in payload:
            check_signature(ROOT / name, script_id)

    template = (ROOT / 'release/updates.template.xri').read_text()
    tree = ET.fromstring(template)
    require(tree.tag == 'xri' and tree.find('.//Signature') is None,
            'Template must be an unsigned XRI')
    packages = tree.findall('./platform/package')
    require(len(packages) == 1, 'Expected one update package')
    for element in tree.findall('.//remove'):
        removals = {entry.strip() for entry in (element.text or '').split(',') if entry.strip()}
        require(removals <= OWNED_REMOVALS, 'Removal list includes an unreviewed or core-owned path')

    output = output.resolve()
    require(not output.is_relative_to(ROOT / 'src') and not output.is_relative_to(ROOT / 'doc'),
            'Output must be outside deployment sources')
    filename = 'TheSpaceKoalaScripts_' + release_date + '.zip'
    if preview:
        filename = 'UNSIGNED_PREVIEW_' + filename
    manifest = output / ('updates.xri.DRAFT' if preview else 'updates.xri')
    # A rebuild must never silently invalidate an XRI already signed by Luca.
    if manifest.exists():
        require('<Signature' not in manifest.read_text(),
                'Output XRI is already signed; use a new output directory')
    output.mkdir(parents=True, exist_ok=True)
    archive = output / filename
    with ZipFile(archive, 'w', compression=ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in sorted(payload.items()):
            info = ZipInfo(name, (date.year, date.month, date.day, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.compress_type = ZIP_DEFLATED
            z.writestr(info, data)
    with ZipFile(archive) as z:
        require(z.testzip() is None, 'Archive CRC validation failed')
        require(set(z.namelist()) == set(payload), 'Archive inventory mismatch')
    checksum = hashlib.sha1(archive.read_bytes()).hexdigest()
    xri = template.replace('PACKAGE_FILENAME_PENDING', filename)
    xri = xri.replace('PACKAGE_SHA1_PENDING', checksum)
    xri = xri.replace('RELEASE_DATE_PENDING', release_date)
    if preview:
        xri = xri.replace('<xri version="1.0">', '<!-- UNSIGNED PREVIEW: missing script signatures; do not sign or publish. -->\n<xri version="1.0">')
    require(ET.fromstring(xri).find('./platform/package').get('sha1') == checksum,
            'Generated XRI checksum mismatch')
    manifest.write_text(xri, encoding='utf-8')
    inventory = {
        'status': 'UNSIGNED PREVIEW — DO NOT PUBLISH' if preview else 'AWAITING XRI SIGNATURE AND PIXINSIGHT VALIDATION',
        'archive': filename,
        'sha1': checksum,
        'missing_signatures': missing,
        'signature_checks': 'Presence, identity, identifier and XML structure only; cryptographic verification requires PixInsight.',
        'files': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(payload.items())},
    }
    (output / 'inventory.json').write_text(json.dumps(inventory, indent=2) + '\n')
    print(inventory['status'])
    print(f'{len(payload)} files; no reserved deployment paths; archive CRC and XRI SHA-1 match.')
    print(archive)
    print(manifest)
    if missing:
        print('Missing: ' + ', '.join(missing))
    return inventory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-date', default='20261110', help='YYYYMMDD (default: 20261110)')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--preview', action='store_true', help='Permit the two missing signatures; emit a non-publishable preview')
    args = parser.parse_args()
    try:
        build(args.output, args.release_date, args.preview)
    except (ValueError, OSError, ET.ParseError) as error:
        print('ERROR: ' + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
