import { test, expect } from '@playwright/test'

test('has title', async ({ page }) => {
  await page.goto('./')

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle('@allmaps/leaflet')
})

test('canvas element exists', async ({ page }) => {
  await page.goto('./')

  await expect(page.locator('canvas')).toBeVisible()
})
