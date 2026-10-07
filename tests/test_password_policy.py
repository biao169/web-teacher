"""Shared password policy; no legacy cost migration or platform-specific format."""
import asyncio
import base64
import hashlib
import unittest
from backend.app.security.passwords import Passwords, ITERATIONS
from backend.app.native.catalog import Error


class PasswordPolicyTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        async def derive(password, salt, iterations):
            self.calls.append(iterations)
            return hashlib.pbkdf2_hmac('sha256', password, salt, iterations, dklen=32)
        self.passwords = Passwords(derive)

    def test_hash_format_random_salt_and_round_trip(self):
        async def check():
            for password in ('Example-password-123', '测试密码-长文本123'):
                encoded = await self.passwords.hash(password)
                algorithm, cost, salt, digest = encoded.split('$')
                self.assertEqual((algorithm, cost), ('pbkdf2_sha256', '100000'))
                self.assertEqual(len(salt), 32)
                self.assertEqual(len(base64.b64decode(digest)), 32)
                self.assertTrue(await self.passwords.verify(password, encoded))
                self.assertFalse(await self.passwords.verify('wrong-password', encoded))
                self.assertNotEqual(encoded, await self.passwords.hash(password))
        asyncio.run(check())
        self.assertEqual(ITERATIONS, 100_000)
        self.assertEqual(set(self.calls), {100_000})

    def test_unsupported_and_malformed_hashes_use_bounded_cost(self):
        async def check():
            encoded = await self.passwords.hash('Example-password-123')
            for invalid in (None, '', 'broken', encoded.replace('$100000$', '$600000$'),
                            encoded.replace('$100000$', '$1000$'), encoded + '!'):
                self.assertFalse(await self.passwords.verify('Example-password-123', invalid))
            self.assertFalse(await self.passwords.verify(None, encoded))
        asyncio.run(check())
        self.assertEqual(set(self.calls), {100_000})

    def test_invalid_new_password_rejected_before_derivation(self):
        for password in (None, '', 'short', 'x'*129):
            with self.assertRaises(Error):
                asyncio.run(self.passwords.hash(password))
        self.assertEqual(self.calls, [])


if __name__ == '__main__':
    unittest.main()
