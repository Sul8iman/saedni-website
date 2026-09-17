export function isUserBlocked(user: { isBlocked: boolean }): boolean {
  return user.isBlocked === true;
}