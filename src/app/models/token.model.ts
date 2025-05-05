export interface DecodedToken {
  sub?: string;
  userId?: string;
  username?: string;
  exp: number;
  iat: number;
}