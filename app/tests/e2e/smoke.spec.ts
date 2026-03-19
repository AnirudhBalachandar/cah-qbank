import { expect, test, type Page } from "@playwright/test";

const email = process.env.DEV_USER_EMAIL ?? "dev@example.com";
const password = process.env.DEV_USER_PASSWORD ?? "changeme123";

async function ensureAuthenticated(page: Page) {
  await page.goto("/");

  const continueButton = page.getByRole("button", { name: "Continue" });
  if (await continueButton.isVisible().catch(() => false)) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await continueButton.click();
  }

  await expect(page).toHaveURL(/\/(dashboard|onboarding)/);
  if (page.url().includes("/onboarding")) {
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }
}

test("sign in, start 1-question session, answer, review", async ({ page }) => {
  test.setTimeout(120000);

  await ensureAuthenticated(page);

  await page.goto("/practice");

  await page.getByLabel("Number of questions").fill("1");
  await page.getByRole("button", { name: "Start session" }).click();

  await expect(page).toHaveURL(/\/session\//);
  const optionA = page.getByRole("button", { name: /Select option A/i });
  await optionA.click();
  await page.getByRole("button", { name: "Set confidence average" }).click();
  await page.getByRole("button", { name: "Submit (Enter)" }).click();
  await expect(page.getByText(/^(Correct|Incorrect)$/).first()).toBeVisible();
  await expect(page.getByText(/Core Idea|Explanation/i).first()).toBeVisible();

  await page.getByRole("link", { name: "Finish & Review" }).click();
  await expect(page).toHaveURL(/\/summary/);
  await expect(page.getByText("Session summary")).toBeVisible();
});

test("admin generated drafts page loads", async ({ page }) => {
  await ensureAuthenticated(page);

  await page.goto("/admin/generated");
  await expect(page.getByText("Generated draft moderation")).toBeVisible();
});
