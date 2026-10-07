"""Single accepted website predecessor, retained CLI contract."""
SUPPORTED=('0.15.160',)
TARGET='0.16.001'
def statements_for(version):
    if version not in SUPPORTED:raise ValueError('Unsupported predecessor')
    from site_sync.integration.migration import statements
    return statements()
def apply(connection,version):
    for statement in statements_for(version):connection.execute(statement)
