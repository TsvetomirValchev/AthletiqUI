export interface DecodedToken {
  sub?: string;
  userId?: string;
  username?: string;
  email?: string;
  exp: number;
  iat: number;
}