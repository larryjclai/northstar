import { X } from "@phosphor-icons/react";
import { Button } from "./coss/button";

/**
 * The one modal/sheet/drawer close button. Before this existed the app had six
 * treatments across 14 sites (3 hit sizes, 3 icon sizes, 3 hover languages) —
 * three of them raw <button>s that bypassed COSS Button's `pointer-coarse`
 * 44pt hit-area expansion, making them the only close buttons genuinely hard
 * to tap on iOS. Use this everywhere; do not hand-build another.
 */
export function ModalCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label="關閉" title="關閉">
      <X />
    </Button>
  );
}
