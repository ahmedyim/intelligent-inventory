class AppError(Exception):
    status_code=500
    code="internal_error"
    def __init__(self,message:str="Something went wrong",code:str|None=None):
        self.message=message
        print(self)
        if code:
            self.code=code
            super().__init__(message)
class NotFoundError(AppError):
    status_code=404
    code="not_found"
    
class ConflictError(AppError):
    status_code = 409
    code = "conflict"
    
class BadRequestError(AppError):
    status_code = 400
    code = "bad_request"
class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"
    
class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"