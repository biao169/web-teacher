"""Safe, structured input errors. Never echo arbitrary request values or secrets."""
class InputError(ValueError):
    def __init__(self,field,message,expected):
        super().__init__(message)
        self.field,self.expected=field,expected
    def payload(self):
        return {'error':str(self),'code':'SYNC_INPUT_INVALID','field':self.field,'expected':self.expected,'stage':'receiver-validation','error_type':'InputError','retryable':False}
