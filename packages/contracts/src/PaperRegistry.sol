// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PaperRegistry
 * @notice Optimized registry for academic papers on World Chain.
 * @dev Optimized for deployment cost and execution gas.
 */
contract PaperRegistry {
    // =========================================================================
    // Errors (Cheaper than require strings)
    // =========================================================================
    error NotOwner();
    error NotAuthor();
    error AlreadyRegistered();
    error InvalidPrice();
    error NotFound();
    error NotActive();

    // =========================================================================
    // Types
    // =========================================================================
    struct Paper {
        address payable author;   // 20 bytes
        uint64 priceQuery;        // 8 bytes
        uint64 priceFull;         // 8 bytes (Fits in Slot 1 with author)
        uint64 priceTraining;     // 8 bytes
        bool active;              // 1 byte
        uint40 createdAt;         // 5 bytes (Fits in Slot 2 with priceTraining/active)
        string metadataURI;       // Independent Slot
        uint256 totalEarnings;    // Independent Slot
        uint256 totalAccesses;    // Independent Slot
    }

    // =========================================================================
    // State
    // =========================================================================

    /// @notice Paper data by hash
    mapping(bytes32 => Paper) public papers;

    /// @notice List of paper hashes per author
    mapping(address => bytes32[]) public authorPapers;

    /// @notice Contract owner (usually the backend bot)
    address public immutable owner;

    // =========================================================================
    // Events
    // =========================================================================
    event PaperRegistered(bytes32 indexed hash, address indexed author, string uri);
    event PaperAccessed(bytes32 indexed hash, address indexed author, uint256 amount);
    event PricingUpdated(bytes32 indexed hash, uint64 pQuery, uint64 pFull);

    // =========================================================================
    // Modifiers & Constructor
    // =========================================================================

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAuthor(bytes32 hash) {
        if (papers[hash].author != msg.sender) revert NotAuthor();
        _;
    }

    // =========================================================================
    // Write Functions
    // =========================================================================

    function registerPaper(
        bytes32 hash,
        string calldata uri,
        uint64 pQuery,
        uint64 pFull,
        uint64 pTraining
    ) external {
        if (papers[hash].author != address(0)) revert AlreadyRegistered();
        if (pQuery == 0) revert InvalidPrice();

        papers[hash] = Paper({
            author: payable(msg.sender),
            priceQuery: pQuery,
            priceFull: pFull,
            priceTraining: pTraining,
            active: true,
            createdAt: uint40(block.timestamp),
            metadataURI: uri,
            totalEarnings: 0,
            totalAccesses: 0
        });

        authorPapers[msg.sender].push(hash);
        emit PaperRegistered(hash, msg.sender, uri);
    }

    function recordAccess(bytes32 hash, uint256 amount) external onlyOwner {
        Paper storage p = papers[hash];
        if (p.author == address(0)) revert NotFound();
        if (!p.active) revert NotActive();

        p.totalEarnings += amount;
        p.totalAccesses += 1;
        emit PaperAccessed(hash, p.author, amount);
    }

    function updatePricing(
        bytes32 hash,
        uint64 pQuery,
        uint64 pFull,
        uint64 pTraining
    ) external onlyAuthor(hash) {
        if (pQuery == 0) revert InvalidPrice();
        
        Paper storage p = papers[hash];
        p.priceQuery = pQuery;
        p.priceFull = pFull;
        p.priceTraining = pTraining;

        emit PricingUpdated(hash, pQuery, pFull);
    }

    // =========================================================================
    // Read Functions
    // =========================================================================

    function getAuthorPapers(address author) external view returns (bytes32[] memory) {
        return authorPapers[author];
    }

    function getPaperStats(bytes32 hash) external view returns (uint256, uint256) {
        return (papers[hash].totalEarnings, papers[hash].totalAccesses);
    }

    function isPaperActive(bytes32 hash) external view returns (bool) {
        return papers[hash].author != address(0) && papers[hash].active;
    }
}
