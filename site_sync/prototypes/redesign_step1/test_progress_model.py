import unittest
from progress_model import commit_piece, fixture, recover, smaller


class ProgressModelTests(unittest.TestCase):
    def setUp(self):
        self.db = fixture()

    def tearDown(self):
        self.db.close()

    def position(self):
        return self.db.execute('SELECT seq,offset FROM job').fetchone()

    def test_response_loss_does_not_duplicate_commit(self):
        with self.assertRaises(RuntimeError):
            commit_piece(self.db, 0, b'abc', interrupt='after_commit')
        self.assertEqual(self.position(), (1, 3))
        self.assertEqual(commit_piece(self.db, 0, b'abc'), 1)
        self.assertEqual(self.db.execute('SELECT count(*) FROM piece').fetchone()[0], 1)

    def test_rollback_keeps_data_and_cursor_together(self):
        with self.assertRaises(RuntimeError):
            commit_piece(self.db, 0, b'abc', interrupt='before_commit')
        self.assertEqual(self.position(), (0, 0))
        self.assertEqual(self.db.execute('SELECT count(*) FROM piece').fetchone()[0], 0)
        self.assertEqual(commit_piece(self.db, 0, b'abc'), 1)

    def test_smaller_slices_continue_at_actual_byte_offset(self):
        expected = b'abcdefghi'
        for offset, body in ((0,b'abcd'), (4,b'ef'), (6,b'g'), (7,b'h'), (8,b'i')):
            commit_piece(self.db, offset, body)
        actual = b''.join(row[0] for row in self.db.execute('SELECT body FROM piece ORDER BY start'))
        self.assertEqual(actual, expected)
        self.assertEqual(self.position(), (5, 9))

    def test_invalid_replay_gap_and_overlap(self):
        commit_piece(self.db, 0, b'abc')
        for start, body in ((0,b'xyz'), (1,b'q'), (4,b'q')):
            with self.subTest(start=start), self.assertRaises(ValueError):
                commit_piece(self.db, start, body)
        self.assertEqual(self.position(), (1, 3))

    def test_stale_lease_and_revocation_block_writes(self):
        with self.assertRaises(PermissionError):
            commit_piece(self.db, 0, b'a', lease='old')
        self.db.execute('UPDATE job SET authorized=0'); self.db.commit()
        with self.assertRaises(PermissionError):
            commit_piece(self.db, 0, b'a')
        self.assertEqual(self.position(), (0, 0))

    def test_changed_source_blocks_mixed_version_payload(self):
        commit_piece(self.db, 0, b'a')
        with self.assertRaises(PermissionError):
            commit_piece(self.db, 1, b'b', source='source-2')
        self.assertEqual(self.position(), (1, 1))

    def test_many_errors_with_durable_progress_do_not_exhaust_budget(self):
        count = 0
        for seq in range(80):
            with self.assertRaises(RuntimeError):
                commit_piece(self.db, seq, b'x', interrupt='after_commit')
            decision = recover(seq, self.position()[0], count, failed=True, fast_retries=2)
            count = decision.consecutive
            self.assertEqual(decision.outcome, 'progress_after_error')
            self.assertEqual(count, 0)

    def test_no_progress_enters_slow_retry_without_terminal_failure(self):
        count = 0
        for _ in range(100):
            decision = recover(0, 0, count, failed=True, fast_retries=2)
            count = decision.consecutive
        self.assertEqual((decision.outcome, decision.delay), ('slow_retry', 3600))
        self.assertEqual(recover(0, 1, count, failed=True).consecutive, 0)

    def test_success_without_progress_does_not_reset_or_consume_budget(self):
        self.assertEqual(recover(3, 3, 5).consecutive, 5)
        self.assertEqual(recover(3, 3, 5).outcome, 'waiting')

    def test_revocation_wins_over_progress(self):
        self.assertEqual(recover(0, 1, 4, failed=True, permanent=True).outcome, 'paused')

    def test_zero_fast_retries_and_invalid_progress(self):
        self.assertEqual(recover(0, 0, 0, failed=True, fast_retries=0).outcome, 'slow_retry')
        with self.assertRaises(ValueError):
            recover(2, 1, 0)

    def test_slice_floor(self):
        self.assertEqual([smaller(x,256) for x in (1024,512,256)], [512,256,256])
        with self.assertRaises(ValueError):
            smaller(128,256)


if __name__ == '__main__':
    unittest.main()
