export function attach(root, options = {}) {
  const items = [...root.querySelectorAll('[data-nav]')];
  if (!items.length) return () => {};
  let index = 0;

  const focusItem = (i, dir = 1) => {
    if (i < 0) i = items.length - 1;
    if (i >= items.length) i = 0;
    const start = i;
    while (items[i]?.disabled) {
      i += dir;
      if (i < 0) i = items.length - 1;
      if (i >= items.length) i = 0;
      if (i === start) break;
    }
    index = i;
    items[i]?.focus();
  };

  const handler = (e) => {
    switch (e.key) {
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        focusItem(index - 1, -1);
        break;
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        focusItem(index + 1, 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        items[index]?.click();
        options.onActivate?.(items[index]);
        break;
      case "Escape":
        e.preventDefault();
        options.onBack?.();
        break;
    }
  };

  focusItem(0);
  root.addEventListener("keydown", handler);

  return () => {
    root.removeEventListener("keydown", handler);
  };
}
