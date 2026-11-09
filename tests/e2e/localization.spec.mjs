import { test, expect } from '../helpers/fixtures.mjs';

const languages = [
  ['en', 'Settings'], ['ro', 'Setări'], ['es', 'Ajustes'],
  ['fr', 'Paramètres'], ['de', 'Einstellungen'], ['it', 'Impostazioni'],
  ['pt-BR', 'Configurações'],
];

test('language can be selected independently of notation and survives reload', async ({ app }) => {
  const page = await app.open();
  await page.locator('#settingsBtn').click();
  await page.locator('#set-notation [data-v="solfege"]').click();
  for (const [code, expected] of languages) {
    await page.locator(`#set-lang [data-v="${code}"]`).click();
    await expect(page.locator('#drawerTitle')).toHaveText(expected);
    await expect(page.locator('#set-notation [data-v="solfege"]')).toHaveAttribute('aria-pressed', 'true');
  }
  await page.reload();
  await expect(page.locator('#drawerTitle')).toHaveText('Configurações');
  await expect(page.locator('#set-lang [data-v="pt-BR"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#set-notation [data-v="solfege"]')).toHaveAttribute('aria-pressed', 'true');
});
