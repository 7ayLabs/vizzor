// ---------------------------------------------------------------------------
// Uniswap V3 SwapRouter02 ABI (exactInputSingle only) + addresses per chain
// ---------------------------------------------------------------------------

export const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

export const SWAP_ROUTER_ADDRESSES: Record<string, string> = {
  // Mainnet
  ethereum: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  polygon: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  arbitrum: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  optimism: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  base: '0x2626664c2603336E57B271c5C0b26F421741e481',
  // Testnets — used for agent test trading
  sepolia: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
  'arbitrum-sepolia': '0x101F443B4d1b059569D643917553c771E1b9663E',
  'base-sepolia': '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
  'optimism-sepolia': '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
  mumbai: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
};

export const WETH_ADDRESSES: Record<string, string> = {
  // Mainnet
  ethereum: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  polygon: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  optimism: '0x4200000000000000000000000000000000000006',
  base: '0x4200000000000000000000000000000000000006',
  // Testnets — WETH on test networks
  sepolia: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  'arbitrum-sepolia': '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
  'base-sepolia': '0x4200000000000000000000000000000000000006',
  'optimism-sepolia': '0x4200000000000000000000000000000000000006',
  mumbai: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
};
