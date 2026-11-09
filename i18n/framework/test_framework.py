import json
from pathlib import Path
import subprocess
import unittest
import validator

HERE = Path(__file__).resolve().parent

class ValidationTests(unittest.TestCase):
    def test_missing_translation_is_an_error(self):
        errors = validator.validate({'strings': {'hello': 'Hello'}}, {'strings': {}})
        self.assertTrue(any('strings.hello' in e for e in errors), errors)

    def test_duplicate_json_keys_rejected(self):
        with self.assertRaises(ValueError):
            validator.parse_payload('{"strings":{"a":"one","a":"two"}}')

    def test_missing_section_lists_all_missing_leaves(self):
        errors = validator.validate({'lessons': {'first': {'t': 'One', 'b': 'Text'}, 'second': {'t': 'Two'}}}, {})
        self.assertEqual(3, len(errors), errors)
        self.assertTrue(any('lessons.first.b' in e for e in errors), errors)

    def test_placeholder_multiset_and_blank_and_unknown(self):
        errors = validator.validate({'strings': {'a': '%s %a %s'}}, {'strings': {'a': '%s %a', 'oops': 'x'}})
        self.assertTrue(any('placeholder' in e for e in errors), errors)
        self.assertTrue(any('oops' in e for e in errors), errors)
        self.assertTrue(validator.validate({'strings': {'a': 'x'}}, {'strings': {'a': '  '}}))

    def test_lesson_functional_attributes_and_markup_are_preserved(self):
        src = {'lessons': {'x': {'t': 'Title', 'b': '<p><button class="demo" data-demo="iv:60:1">Play</button></p>'}}}
        self.assertEqual([], validator.validate(src, {'lessons': {'x': {'t': 'Titre', 'b': '<p><button class="demo" data-demo="iv:60:1">Jouer</button></p>'}}}))
        for broken in ['<p><button class="demo" data-demo="iv:60:2">Jouer</button></p>', '<p><button>Jouer</p>', '<p>Jouer</p>']:
            self.assertTrue(validator.validate(src, {'lessons': {'x': {'t': 'Titre', 'b': broken}}}), broken)

    def test_actual_source_inventory_contains_lessons_dynamic_data(self):
        result = subprocess.run(['node', str(HERE / 'inventory.cjs')], capture_output=True, text=True, encoding='utf8', check=True)
        source = json.loads(result.stdout)
        self.assertGreater(len(source['strings']), 1300)
        self.assertGreaterEqual(len(source['lessons']), 22)
        self.assertIn('keys', source['lessons'])
        self.assertIn('data-demo=', source['lessons']['keys']['b'])
        self.assertEqual(source['music']['intervals']['1'], 'Minor 2nd')
        self.assertIn('Major (Ionian)', source['music']['scales'])
        self.assertIn('maj', source['music']['chords'])
        self.assertGreater(len(source['units']), 0)
        self.assertGreater(len(source['glossary']), 0)
        self.assertIn('keys', source['quizzes'])
        self.assertEqual(source['quizzes']['keys'][0]['q'], 'Which white key sits just left of the group of two black keys?')
        self.assertIn('keys', source['summaries'])

    def test_audit_reports_unresolved_static_keys(self):
        source = {'strings': {'known': 'Hello'}}
        report = validator.audit_references('<b data-i18n="known"></b><i data-i18n="missing"></i><script>t("other"); t(key); tl("en","known")</script>', source)
        self.assertEqual(['missing', 'other'], report['missing'])
        self.assertGreater(report['dynamic_calls'], 0)

    def test_empty_source_sentinel_can_remain_empty(self):
        self.assertEqual([], validator.validate({'summaries': {'iv': [['', 'P5']]}}, {'summaries': {'iv': [['', 'P5']]}}))

if __name__ == '__main__':
    unittest.main()
