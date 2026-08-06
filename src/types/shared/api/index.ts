export interface SuccessResponse<T = unknown> {
    success: true;
    statusCode: number;
    data: T;
    timestamp: string;
}

export interface FailedResponse {
    success: false;
    statusCode: number;
    error: string;
    timestamp: string;
    errors?: ValidationError[];
}

export interface ValidationError {
    field: string;
    message: string;
}

export interface PaginatedResponse<T> extends SuccessResponse<T[]> {
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export type ApiResult<T = unknown> = SuccessResponse<T> | FailedResponse;    