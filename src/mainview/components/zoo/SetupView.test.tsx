import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TooltipProvider } from "../ui/tooltip"
import { SetupView } from "./SetupView"

test("SetupView renders the conversation, history, and names-only credential surfaces", () => {
  const html = renderToStaticMarkup(
    <TooltipProvider>
      <SetupView baseUrl={null} repoId={null} onBack={() => {}} />
    </TooltipProvider>,
  )
  expect(html).toContain("Back to Zoo")
  expect(html).toContain("New setup conversation")
  expect(html).toContain("Setup sessions")
  expect(html).toContain("Named credentials")
  expect(html).toContain("Values are never displayed after saving")
  expect(html).toContain("Connect to Chunky")
  expect(html).toContain('type="password"')
})
