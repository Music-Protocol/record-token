// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

// import "hardhat/console.sol";

library OrderedArray {
    //insertInOrder(myArray, address);
    function insertInOrder(address[] storage arr) internal {
        if (arr.length <= 1) {
            return;
        }
        address element =arr[arr.length - 1];
        // Find the correct position for the element using binary search
        int256 min = 0;
        int256 max = int256(arr.length) - 2;
        while (min <= max) {
            int256 mid = (min + max) / 2;
            if (arr[uint256(mid)] < element) {
                min = mid + 1;
            } else {
                max = mid - 1;
            }
        }
        int256 insertPos = min;
        // Shift the elements to the right to make room for the new element
        for (int256 i = int256(arr.length) - 1; i > insertPos; i--) {
            arr[uint256(i)] = arr[uint256(i) - 1];
        }
        // Insert the element
        arr[uint256(insertPos)] = element;
    }

    //int index = binarySearch(myArray, address);
    function binarySearch(
        address[] memory arr,
        address target
    ) public pure returns (int256) {
        int256 min = 0;
        int256 max = int256(arr.length) - 1;
        while (min <= max) {
            int256 mid = (min + max) / 2;
            if (arr[uint256(mid)] < target) {
                min = mid + 1;
            } else if (arr[uint256(mid)] > target) {
                max = mid - 1;
            } else {
                // Target found
                return int256(mid);
            }
        }
        // Target not found
        return -1;
    }
}
