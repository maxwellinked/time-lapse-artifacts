"""Reject changes outside the approved one-work, 38-record mirror append."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / 'tools/refresh-confirmed-work-projection.py'
CONFIRMATION = ROOT / 'tests/fixtures/2026-10-31-one-drawing-38-recordings.json'


class ConfirmedWorkProjectionTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(MODULE.is_file(), 'Bounded confirmed-work projection is not implemented')
        spec = importlib.util.spec_from_file_location('confirmed_projection', MODULE)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.raw = CONFIRMATION.read_bytes()
        confirmation = json.loads(self.raw)
        self.work = 'tlaw-d5e993f2657744f6'
        old = 'tlaw-1111111111111111'
        self.before = {
            'metadata': [{'record_id': 'tla-1111111111111111', 'work_id': old,
                          'file_name': 'Standard_Time_Lapses/old.mp4', 'size_bytes': '42'}],
            'works': [{'work_id': old, 'status': 'active', 'creation_evidence': 'retained'}],
            'links': [{'record_id': 'tla-1111111111111111', 'work_id': old,
                       'owner_confirmation_state': 'owner_confirmed', 'source_hub_revision': '1' * 40}],
            'selections': [{'work_id': old, 'photo_role': 'front', 'source_photograph_sha256': '2' * 64,
                            'display': {'sha256': '3' * 64}, 'download': {'sha256': '4' * 64}}],
            'unselected_work_ids': [], 'photo_manifest_sha256': '5' * 64,
        }
        self.after = copy.deepcopy(self.before)
        self.after['works'].append({'work_id': self.work, 'status': 'active',
            'creation_evidence': 'confirmation_path=Work_Identity/Confirmations/2026-10-31-one-drawing-38-recordings.json; confirmation_sha256=' + hashlib.sha256(self.raw).hexdigest()})
        self.identities = {}
        for member in confirmation['members']:
            self.after['metadata'].append({'record_id': member['record_id'], 'work_id': self.work,
                'file_name': member['file_path'], 'size_bytes': str(member['size_bytes'])})
            self.after['links'].append({'record_id': member['record_id'], 'work_id': self.work,
                'owner_confirmation_state': 'owner_confirmed', 'source_hub_revision': '6' * 40})
            self.identities[member['file_path']] = (member['sha256'], member['size_bytes'])
        self.after['unselected_work_ids'].append(self.work)

    def check(self):
        return self.module.validate_release(self.before, self.after, self.raw, self.identities)

    def test_exact_confirmed_membership_is_accepted_without_selecting_a_photo(self):
        result = self.check()
        self.assertEqual(result['work_id'], 'tlaw-d5e993f2657744f6')
        self.assertEqual(result['added_count'], 38)
        self.assertEqual(self.after['selections'], self.before['selections'])

    def test_reassignment_of_an_old_positive_relationship_is_rejected(self):
        self.after['links'][0]['work_id'] = self.work
        with self.assertRaisesRegex(ValueError, 'Retained.*links'):
            self.check()

    def test_edit_to_an_old_complete_metadata_row_is_rejected(self):
        self.after['metadata'][0]['size_bytes'] = '43'
        with self.assertRaisesRegex(ValueError, 'Retained.*metadata'):
            self.check()

    def test_old_work_retirement_or_note_change_is_rejected(self):
        self.after['works'][0]['status'] = 'superseded'
        with self.assertRaisesRegex(ValueError, 'Retained.*works'):
            self.check()

    def test_changed_confirmation_cannot_redefine_the_approved_members(self):
        confirmation = json.loads(self.raw)
        confirmation['members'][0]['sha256'] = '0' * 64
        self.raw = json.dumps(confirmation).encode()
        with self.assertRaisesRegex(ValueError, 'confirmation.*hash'):
            self.check()

    def test_a_work_row_cannot_bind_another_confirmation(self):
        self.after['works'][-1]['creation_evidence'] = 'confirmation_sha256=' + '0' * 64
        with self.assertRaisesRegex(ValueError, 'creation evidence'):
            self.check()

    def test_missing_extra_or_duplicate_member_is_rejected(self):
        for mutation in [lambda rows: rows.pop(), lambda rows: rows.append(copy.deepcopy(rows[-1])),
                         lambda rows: rows[-1].update(record_id='tla-2222222222222222')]:
            after = copy.deepcopy(self.after)
            mutation(after['metadata'])
            with self.subTest(mutation=mutation):
                with self.assertRaisesRegex(ValueError, 'membership|Duplicate'):
                    self.module.validate_release(self.before, after, self.raw, self.identities)

    def test_edited_export_cannot_replace_an_original(self):
        self.after['metadata'][-1]['file_name'] = 'Standard_Time_Lapses/2026-10-31.1040.mp4'
        with self.assertRaisesRegex(ValueError, 'member.*path'):
            self.check()

    def test_changed_source_media_hash_or_length_is_rejected(self):
        path = self.after['metadata'][-1]['file_name']
        original = self.identities[path]
        for identity in [('0' * 64, original[1]), (original[0], original[1] + 1)]:
            self.identities[path] = identity
            with self.subTest(identity=identity):
                with self.assertRaisesRegex(ValueError, 'media identity'):
                    self.check()

    def test_nonpositive_new_link_is_rejected(self):
        self.after['links'][-1]['owner_confirmation_state'] = 'proposed'
        with self.assertRaisesRegex(ValueError, 'positive new link'):
            self.check()

    def test_new_work_cannot_promote_a_photo_or_change_an_old_selection(self):
        for mutation in [lambda value: value['selections'][0]['download'].update(sha256='0' * 64),
                         lambda value: value['selections'].append({'work_id': self.work}),
                         lambda value: value['unselected_work_ids'].clear()]:
            after = copy.deepcopy(self.after)
            mutation(after)
            with self.subTest(mutation=mutation):
                with self.assertRaisesRegex(ValueError, 'selection|unselected'):
                    self.module.validate_release(self.before, after, self.raw, self.identities)

    def test_historical_photo_authority_cannot_change_during_this_append(self):
        self.after['photo_manifest_sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'photograph manifest'):
            self.check()

    def evidence_fixture(self):
        sha = 'a' * 64
        inputs = {path: ('retained:' + path).encode() for path in self.module.EVIDENCE.SOURCES}
        photo = dict(sha256=sha, relationship_status='proposed',
                     work_id=self.before['works'][0]['work_id'], evidence_reference_id='retained-ref')
        lookup = self.module.M.json_bytes(dict(records={'old': dict(mainImage=photo, additionalReferences=[])}))
        evidence = dict(lookupSha256=hashlib.sha256(lookup).hexdigest(),
            sourceInputs={path: dict(sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))
                          for path, raw in inputs.items()},
            images={sha: dict(workId=photo['work_id'], referenceId='retained-ref', caution='retained qualification')})
        current = dict(inputs)
        for path in self.module.EVIDENCE.SOURCES[:2]:
            current[path] += b'confirmed append'
        return lookup, evidence, inputs, current

    def test_append_retains_hash_bound_historical_proof_instead_of_reconstructing_it(self):
        lookup, evidence, prior, current = self.evidence_fixture()
        retained = self.module.retain_evidence(evidence, lookup, json.loads(lookup)['records'],
            prior, current, b'current lookup', '8' * 40)
        self.assertEqual(retained['images'], evidence['images'])
        self.assertEqual(retained['sourceRevision'], '8' * 40)
        self.assertEqual(retained['sourceInputs']['Work_Identity/works.csv']['sha256'],
                         hashlib.sha256(current['Work_Identity/works.csv']).hexdigest())
        self.assertNotIn('sourceRevision', evidence)

    def test_changed_historical_proof_premise_is_rejected(self):
        lookup, evidence, prior, current = self.evidence_fixture()
        prior['Work_Identity/works.csv'] += b'unbound change'
        with self.assertRaisesRegex(ValueError, 'premise input'):
            self.module.retain_evidence(evidence, lookup, json.loads(lookup)['records'],
                prior, current, b'current lookup', '8' * 40)


if __name__ == '__main__':
    unittest.main()
