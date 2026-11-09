"""Fail-closed validation of a locale payload against the extracted English source."""
import argparse
from collections import Counter
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
PLACEHOLDERS = re.compile(r'%[sab]')
TAG = re.compile(r'</?[A-Za-z][\w:-]*(?:\s|/?>)')
VOID = frozenset('area base br col embed hr img input link meta param source track wbr'.split())
TEXT_ATTRS = frozenset(('title', 'aria-label', 'alt', 'placeholder'))

class Structure(HTMLParser):
    def __init__(self, value):
        super().__init__(convert_charrefs=True)
        self.events, self.stack, self.errors = [], [], []
        try:
            self.feed(value)
            self.close()
            if self.stack:
                self.errors.append('unclosed tags: ' + ', '.join(self.stack))
        except (ValueError, AssertionError) as e:
            self.errors.append(str(e))

    def handle_starttag(self, tag, attrs):
        names = [k for k, _ in attrs]
        if len(names) != len(set(names)):
            self.errors.append('duplicate attributes')
        fixed = tuple(sorted((k, v) for k, v in attrs if k not in TEXT_ATTRS))
        texts = tuple(sorted((k, tuple(sorted(PLACEHOLDERS.findall(v or '')))) for k, v in attrs if k in TEXT_ATTRS))
        self.events.append(('start', tag, fixed, texts))
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if not self.stack or self.stack[-1] != tag:
            self.errors.append('mismatched closing tag: ' + tag)
        else:
            self.stack.pop()
        self.events.append(('end', tag))


def validate(source, target):
    errors = []
    def missing(value, loc):
        if isinstance(value, dict) and value:
            for key, child in value.items():
                missing(child, f'{loc}.{key}' if loc else key)
        elif isinstance(value, list) and value:
            for i, child in enumerate(value):
                missing(child, f'{loc}[{i}]')
        else:
            errors.append(f'{loc}: missing')
    def walk(src, dst, loc):
        if isinstance(src, dict):
            if not isinstance(dst, dict):
                errors.append(f'{loc}: expected object')
                return
            for key in src.keys() - dst.keys():
                missing(src[key], f'{loc}.{key}' if loc else key)
            for key in dst.keys() - src.keys():
                errors.append(f'{loc}.{key}: unknown')
            for key in src.keys() & dst.keys():
                walk(src[key], dst[key], f'{loc}.{key}' if loc else key)
        elif isinstance(src, list):
            if not isinstance(dst, list):
                errors.append(f'{loc}: expected array')
                return
            if len(src) != len(dst):
                errors.append(f'{loc}: expected {len(src)} entries, got {len(dst)}')
            for i, (a, b) in enumerate(zip(src, dst)):
                walk(a, b, f'{loc}[{i}]')
        elif isinstance(src, str):
            if not isinstance(dst, str) or (src.strip() and not dst.strip()):
                errors.append(f'{loc}: expected nonempty string')
                return
            if Counter(PLACEHOLDERS.findall(src)) != Counter(PLACEHOLDERS.findall(dst)):
                errors.append(f'{loc}: placeholder multiset differs')
            if TAG.search(src) or TAG.search(dst):
                a, b = Structure(src), Structure(dst)
                if a.errors:
                    errors.append(f'{loc}: invalid source HTML: {a.errors}')
                if b.errors:
                    errors.append(f'{loc}: invalid translated HTML: {b.errors}')
                if a.events != b.events:
                    errors.append(f'{loc}: HTML structure or functional attributes differ')
        else:
            errors.append(f'{loc}: unsupported source type {type(src).__name__}')
    walk(source, target, '')
    return sorted(errors)


def audit_references(html, source):
    # Best-effort lexical audit, not a JavaScript parser. Expressions require manual review.
    attrs = set(re.findall(r'''data-i18n(?:-aria|-title)?\s*=\s*["']([\w-]+)["']''', html))
    calls = list(re.finditer(r'''(?<![\w.])t\(\s*([^\s,)]+)''', html))
    calls += list(re.finditer(r'''(?<![\w.])tl\(\s*[^,()]+,\s*([^\s,)]+)''', html))
    literal = set()
    dynamic = 0
    for match in calls:
        arg = match.group(1)
        if re.fullmatch(r'''["'][\w-]+["']''', arg):
            literal.add(arg[1:-1])
        else:
            dynamic += 1
    return {'attributes': len(attrs), 'literal_calls': len(literal),
            'dynamic_calls': dynamic, 'missing': sorted((attrs | literal) - source['strings'].keys())}


def parse_payload(text):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f'duplicate JSON key: {key}')
            result[key] = value
        return result
    return json.loads(text, object_pairs_hook=unique)


def inventory(html=None):
    command = ['node', str(HERE / 'inventory.cjs')]
    if html is not None:
        command.append(str(html))
    result = subprocess.run(command, check=True, capture_output=True, text=True, encoding='utf-8')
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('payload', nargs='?', help='locale payload JSON')
    parser.add_argument('--html', help='source HTML (default: ../etude.html)')
    parser.add_argument('--inventory', action='store_true', help='print English source JSON to stdout')
    parser.add_argument('--audit', action='store_true', help='report best-effort static references and dynamic calls')
    args = parser.parse_args()
    if not args.inventory and not args.audit and not args.payload:
        parser.error('provide a payload, --inventory, or --audit')
    try:
        source = inventory(args.html)
        if args.inventory:
            print(json.dumps(source, ensure_ascii=False, indent=2))
            return 0
        if args.audit:
            text = Path(args.html or HERE.parent / 'etude.html').read_text(encoding='utf-8')
            # Exclude embedded audio and OSMD, preserving static markup and app script.
            start, library, app = text.find('<a class="skip-link"'), text.find('<script type="application/json" id="piano-recordings">'), text.find('const STRINGS={')
            if min(start, library, app) < 0 or not start < library < app:
                raise ValueError('Cannot locate app audit boundaries')
            report = audit_references(text[start:library] + text[app:], source)
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 1 if report['missing'] else 0
        with open(args.payload, encoding='utf-8') as f:
            target = parse_payload(f.read())
        errors = validate(source, target)
    except (OSError, ValueError, subprocess.CalledProcessError) as e:
        print(f'Cannot validate: {e}', file=sys.stderr)
        if isinstance(e, subprocess.CalledProcessError):
            print(e.stderr, file=sys.stderr)
        return 2
    if errors:
        print('\n'.join(errors))
        print(f'FAIL: {len(errors)} issues', file=sys.stderr)
        return 1
    print('PASS: all inventoried entries and structures match')
    return 0
