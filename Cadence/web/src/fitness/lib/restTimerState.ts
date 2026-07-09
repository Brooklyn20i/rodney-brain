export function shouldFireRestCompleteCue(leftSeconds: number, alreadyChimed: boolean) {
  return leftSeconds <= 0 && !alreadyChimed;
}
