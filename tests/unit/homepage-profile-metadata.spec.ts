import { afterEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type { H3Event } from 'h3'
import { CompleteAdminMetadataService } from '../../server/services/complete-admin/metadata-service'

const state = vi.hoisted(() => ({ first: vi.fn() }))
vi.mock('../../server/utils/complete-admin/db', () => ({ resolveAdminDatabase: async () => ({ first: state.first }) }))
let db: DatabaseSync | undefined
afterEach(() => { db?.close(); db = undefined; state.first.mockReset() })

describe('homepage author helper', () => {
  it('extracts the same first public active featured teacher, ignoring an ordinary earlier record', async () => {
    db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE profiles(id INTEGER PRIMARY KEY,uid TEXT,name TEXT,name_en TEXT,visibility TEXT,is_active INTEGER,is_featured INTEGER,sort_order INTEGER);
      INSERT INTO profiles VALUES(1,'ordinary','普通成员','Ordinary','public',1,0,-10),
        (2,'hidden','隐藏成员','Hidden','hidden',1,1,-9),
        (3,'inactive','停用成员','Inactive','public',0,1,-8),
        (4,'featured-a','教师甲','Teacher A','public',1,1,0),
        (5,'featured-b','教师乙','Teacher B','public',1,1,0);`)
    state.first.mockImplementation(async (sql: string) => db!.prepare(sql).get() ?? null)
    const service = new CompleteAdminMetadataService({} as H3Event)
    expect((await service.homepageProfile()).profile).toMatchObject({ uid: 'featured-a', names: ['教师甲', 'Teacher A'] })
    db.exec("UPDATE profiles SET sort_order=-1 WHERE uid='featured-b'")
    expect((await service.homepageProfile()).profile?.uid).toBe('featured-b')
    db.exec("UPDATE profiles SET is_featured=0 WHERE uid IN ('featured-a','featured-b')")
    expect((await service.homepageProfile()).profile).toBeNull()
  })
})
