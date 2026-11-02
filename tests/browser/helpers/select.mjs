import { expect } from '@playwright/test';
/** Exercise the visible custom control, never mutate its hidden form bridge. */
export async function selectOption(control, value) {
  await control.click();
  const listId = await control.getAttribute('aria-controls');
  await control.page().locator(`[id=${JSON.stringify(listId)}] [data-option-value=${JSON.stringify(String(value))}]`).click();
  await expect(control).toHaveAttribute('data-select-value', String(value));
}
export async function expectValue(control, value) {
  if (await control.getAttribute('data-select-trigger') !== null) await expect(control).toHaveAttribute('data-select-value', String(value));
  else await expect(control).toHaveValue(value);
}
