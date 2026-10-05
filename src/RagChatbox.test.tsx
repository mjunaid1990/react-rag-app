import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RagChatbox } from "./RagChatbox";

afterEach(cleanup);

describe("RagChatbox", () => {
  it("renders configuration and sends a message with history, then displays the answer and safe sources", async () => {
    const user = userEvent.setup();
    const onRequest = vi.fn().mockResolvedValue({
      answer: "A **grounded** reply.",
      sources: [
        { title: "Helpful article", url: "https://example.com/help" },
        { title: "Unsafe source", url: "javascript:alert(1)" },
      ],
      conversationId: "conv-1",
    });
    render(<RagChatbox mode="inline" onRequest={onRequest} title="Help center" />);

    expect(screen.getByRole("heading", { name: "Help center" })).toBeTruthy();
    const input = screen.getByLabelText("Message Assistant");
    await user.type(input, "How can I get help?");
    await user.keyboard("{Enter}");

    expect(await screen.findByText((_, element) => element?.tagName === "P" && element.textContent === "A grounded reply.")).toBeTruthy();
    expect(onRequest).toHaveBeenCalledWith({ message: "How can I get help?", history: [] });
    expect(screen.getByRole("link", { name: "Helpful article" }).getAttribute("href")).toBe("https://example.com/help");
    expect(screen.getByText("Unsafe source").closest("a")).toBeNull();
  });

  it("shows thinking and offers retry after an error", async () => {
    const user = userEvent.setup();
    const onRequest = vi.fn()
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce({ answer: "Recovered." });
    render(<RagChatbox mode="inline" onRequest={onRequest} />);
    await user.type(screen.getByLabelText("Message Assistant"), "Try this");
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Network unavailable")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Recovered.")).toBeTruthy();
    expect(onRequest).toHaveBeenCalledTimes(2);
    expect(onRequest.mock.calls[1][0].history).toEqual([]);
  });

  it("shows a loading state and disables sending while the request is pending", async () => {
    const user = userEvent.setup();
    let resolveResponse!: (value: { answer: string }) => void;
    const pending = new Promise<{ answer: string }>((resolve) => { resolveResponse = resolve; });
    const onRequest = vi.fn(() => pending);
    render(<RagChatbox mode="inline" onRequest={onRequest} />);
    await user.type(screen.getByLabelText("Message Assistant"), "Please wait");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("status").textContent).toContain("thinking");
    expect(screen.getByRole("button", { name: "Send message" }).hasAttribute("disabled")).toBe(true);
    resolveResponse({ answer: "Done." });
    expect(await screen.findByText("Done.")).toBeTruthy();
  });

  it("shows a configuration error and clears conversation on reset", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    const onRequest = vi.fn().mockResolvedValue({ answer: "A response" });
    const { rerender } = render(<RagChatbox mode="inline" />);
    expect(screen.getByRole("alert").textContent).toContain("not configured");
    rerender(<RagChatbox mode="inline" onRequest={onRequest} onReset={onReset} />);
    await user.type(screen.getByLabelText("Message Assistant"), "Hello");
    fireEvent.keyDown(screen.getByLabelText("Message Assistant"), { key: "Enter", shiftKey: true });
    expect((screen.getByLabelText("Message Assistant") as HTMLTextAreaElement).value).toContain("Hello");
    expect(onRequest).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("A response")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear conversation" }));
    expect(screen.queryByText("A response")).toBeNull();
    expect(onReset).toHaveBeenCalledOnce();
  });
});
