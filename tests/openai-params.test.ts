import { describe, expect, it, vi } from "vitest";
import { withTemperature } from "../src/domain/openai-params.js";

const tempErr = () => Object.assign(new Error("400 Unsupported value: 'temperature' does not support 0 with this model."), { status: 400 });

describe("withTemperature", () => {
  it("usa a temperatura pedida quando o modelo aceita", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await withTemperature("m-ok", 0, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(0);
  });

  it("repete sem temperatura quando o modelo recusa e lembra da recusa", async () => {
    const fn = vi.fn().mockRejectedValueOnce(tempErr()).mockResolvedValue("ok");
    expect(await withTemperature("m-luna", 0, fn)).toBe("ok");
    expect(fn.mock.calls.map((c) => c[0])).toEqual([0, undefined]);

    const fn2 = vi.fn().mockResolvedValue("ok");
    await withTemperature("m-luna", 0, fn2);
    expect(fn2).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledWith(undefined);
  });

  it("não engole outros erros", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("500 boom"), { status: 500 }));
    await expect(withTemperature("m-x", 0, fn)).rejects.toThrow(/boom/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
