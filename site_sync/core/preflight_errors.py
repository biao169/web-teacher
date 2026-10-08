"""Safe structured task admission failure; no transport or website imports."""
class PreflightError(Exception):
    def __init__(self,payload,status=409):
        super().__init__(payload['error'])
        self.result=payload;self.status=status
    def payload(self):return self.result

