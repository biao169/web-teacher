"""Shared domain exception without importing schema/editor metadata."""
class Error(Exception):
    """Expected domain error rendered without SQL, credentials or tracebacks."""
    def __init__(self,message,status=422,code=None):"""保存构造参数和适配器，供此对象后续操作复用。""";self.message=message;self.status=status;self.code=code;super().__init__(message)
