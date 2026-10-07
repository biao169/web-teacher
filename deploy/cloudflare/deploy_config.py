"""Build-only identity and credential checks. Never serialize credentials."""
import re
from companions import names


def validate(env, main, *, credentials=True):
    targets=names(main)
    ci_name=env.get('WRANGLER_CI_OVERRIDE_NAME','').strip()
    if ci_name and ci_name!=main:
        raise ValueError('主站名称与关联构建项目不一致 / CI Worker name must equal TEACHER_WORKER_NAME')
    if env.get('WRANGLER_CI_MATCH_TAG') and not ci_name:
        raise ValueError('CI match tag present without CI Worker name; cannot establish build identity')
    if credentials:
        if not re.fullmatch(r'[a-fA-F0-9]{32}',env.get('CLOUDFLARE_ACCOUNT_ID','')):
            raise ValueError('请设置构建变量 CLOUDFLARE_ACCOUNT_ID（32位账号ID）')
        token=env.get('TEACHER_AUX_API_TOKEN','')
        if not token or any(c.isspace() for c in token):
            raise ValueError('请设置构建 Secret TEACHER_AUX_API_TOKEN，授权目标账号 Workers Scripts 编辑')
        if not re.fullmatch(r'[a-fA-F0-9]{64}',env.get('TEACHER_SYNC_KEY','')):
            raise ValueError('请设置构建 Secret TEACHER_SYNC_KEY（64位随机十六进制密钥）')
    return targets
