// Galat yang pesannya aman ditampilkan ke pengguna, beserta status HTTP-nya.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
