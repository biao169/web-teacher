"""Real SQLite + HTTP + template checks for early conditional responses."""
import asyncio
from unittest.mock import patch
import pytest
from backend.app.native.public_http_cache import matches_etag
run=asyncio.run

@pytest.mark.parametrize('header,expected',[
 ('"abc"',True),('W/"abc"',True),(' "other", W/"abc" ',True),('*',True),
 ('"a,b", "abc"',True),(', , "abc",',True),('"abc"junk',False),
 ('abc',False),('W/abc',False),('"ABC"',False),('*, "abc"',False),
 ('"abc",bad',False),('"abc"'*3000,False),('',False),
])
def test_matching(header,expected):assert matches_etag(header,'W/"abc"')==expected

