export async function simulateAndAssemble(
  rpcUrl: string,
  txXdr: string,
): Promise<{ xdr: string; cost: { cpuInsns: string; memBytes: string } }> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'simulateTransaction',
      params: { transaction: txXdr },
    }),
  });
  const { result } = await res.json();
  if (result.error) {
    throw new Error(result.error.message);
  }
  return { xdr: result.transactionData, cost: result.cost ?? { cpuInsns: '0', memBytes: '0' } };
}
