export interface ApiResponse<T = unknown> {
  success: boolean;
  status: number | string;
  message: string;
  payload: T | null;
}
