import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('confirmed_multi', ROOT / 'tools/refresh-confirmed-work-projection.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
DEFINITION = {
    'schemaVersion': 1,
    'browserBase': 'c7a5c8325882cc7ef65458604ce90d21cd3eca36',
    'sourceBaseRevision': '86d35414d4ada7cfc3cc76c2c84ccaaeeac7c477',
    'confirmation': {
        'path': 'Work_Identity/Confirmations/2026-11-10-two-drawings-32-recordings.json',
        'sha256': '590a5ed36f692419f7d7f522852d31b8d027d8b410f316e685c0fef0bd2da1ad',
    },
    'workCounts': [
        {'workId': 'tlaw-e5c89a91491998a7', 'count': 3},
        {'workId': 'tlaw-6a4a3ee3fdd84066', 'count': 29},
    ],
}

class MultipleWorkAppendTests(unittest.TestCase):
    def setUp(self):
        self.raw = (ROOT / 'tests/fixtures/2026-11-10-two-drawings-32-recordings.json').read_bytes()
        self.definition = copy.deepcopy(DEFINITION)
        self.before = dict(metadata=[], works=[], links=[], selections=[{'work_id': 'retained'}],
            unselected_work_ids=['tlaw-d5e993f2657744f6'], photo_manifest_sha256='a' * 64)
        self.after = copy.deepcopy(self.before)
        self.identities = {}
        for item in self.definition['workCounts']:
            self.after['works'].append(dict(work_id=item['workId'], status='active',
                creation_evidence='confirmation_path=' + self.definition['confirmation']['path'] +
                '; confirmation_sha256=' + self.definition['confirmation']['sha256']))
            self.after['unselected_work_ids'].append(item['workId'])
        self.after['unselected_work_ids'].sort()
        for member in json.loads(self.raw)['members']:
            self.after['metadata'].append(dict(record_id=member['record_id'], work_id=member['work_id'],
                file_name=member['file_path'], size_bytes=str(member['size_bytes'])))
            self.after['links'].append(dict(record_id=member['record_id'], work_id=member['work_id'],
                owner_confirmation_state='owner_confirmed', source_hub_revision='8' * 40))
            self.identities[member['file_path']] = (member['sha256'], member['size_bytes'])

    def check(self):
        return MODULE.validate_release(self.before, self.after, self.raw, self.identities,
                                       append_definition=self.definition)

    def test_two_work_membership_and_original_final_parts_are_supported(self):
        result = self.check()
        self.assertEqual(result['added_count'], 32)
        self.assertEqual(result['work_ids'], [x['workId'] for x in DEFINITION['workCounts']])
        self.assertEqual(len(result['record_work_ids']), 32)
        self.assertEqual(self.after['selections'], self.before['selections'])

    def test_swapping_a_record_between_the_two_works_is_rejected(self):
        self.after['metadata'][0]['work_id'] = DEFINITION['workCounts'][1]['workId']
        self.after['links'][0]['work_id'] = DEFINITION['workCounts'][1]['workId']
        with self.assertRaisesRegex(ValueError, 'positive new link'):
            self.check()

    def test_definition_cannot_change_counts_or_confirmation_hash(self):
        for field in ['count', 'hash']:
            self.definition = copy.deepcopy(DEFINITION)
            if field == 'count':
                self.definition['workCounts'][0]['count'] = 4
            else:
                self.definition['confirmation']['sha256'] = '0' * 64
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'count|membership|hash'):
                self.check()

    def test_unselected_work_ids_use_the_source_sorted_union_with_interleaving_ids(self):
        self.assertEqual(self.after['unselected_work_ids'], [
            'tlaw-6a4a3ee3fdd84066', 'tlaw-d5e993f2657744f6', 'tlaw-e5c89a91491998a7'])
        self.check()

    def test_missing_duplicate_or_unsorted_unselected_work_ids_are_rejected(self):
        original = list(self.after['unselected_work_ids'])
        for candidate in [original[:-1], original + [original[0]], list(reversed(original))]:
            self.after['unselected_work_ids'] = candidate
            with self.subTest(candidate=candidate), self.assertRaisesRegex(ValueError, 'unselected'):
                self.check()

    def test_unsupported_endpoint_scope_is_rejected(self):
        self.after['links'][-1]['temporal_scope'] = 'endpoint'
        with self.assertRaisesRegex(ValueError, 'endpoint/surface'):
            self.check()

if __name__ == '__main__':
    unittest.main()
