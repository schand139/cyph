// ABIs for interacting with blockchain contracts

// Define types for ABIs
type AbiFragment = string;
type Abi = AbiFragment[];

// ERC20 token ABI (minimal version for common operations)
export const erc20ABI: Abi = [
  // Read-only functions
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  
  // Events
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

// Uniswap/Aerodrome V3 Pool ABI (minimal version for price queries)
export const uniswapV3PoolABI: Abi = [
  // Read-only functions
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  
  // Events
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
];

// ERC721 NFT ABI (minimal version for common operations)
export const erc721ABI: Abi = [
  // Read-only functions
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  
  // Events
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)',
];

// Factory ABIs for various protocols
export const uniswapV3FactoryABI: Abi = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
];

// Aerodrome Factory ABI
export const aerodromeFactoryABI: Abi = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function allPairsLength() external view returns (uint256)',
  'function allPairs(uint256) external view returns (address)',
];

// Aerodrome Pair ABI
export const aerodromePairABI: Abi = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
];

// Router ABIs
export const uniswapV3RouterABI: Abi = [
  'function factory() external view returns (address)',
  'function WETH9() external view returns (address)',
];
