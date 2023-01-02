// SPDX-License-Identifier: MIT

pragma solidity ^0.8.16;

library OrderedArray {
    //insertInOrder(myArray, address);
    function insertInOrder(address[] storage arr, address element) internal {
        if (arr.length == 0) {
            // Array is empty, just add the element
            arr.push(element);
            return;
        }
        // Find the correct position for the element using binary search
        uint256 min = 0;
        uint256 max = arr.length - 1;
        while (min <= max) {
            uint256 mid = (min + max) / 2;
            if (arr[mid] < element) {
                min = mid + 1;
            } else {
                max = mid - 1;
            }
        }
        uint256 insertPos = min;
        // Shift the elements to the right to make room for the new element
        for (uint256 i = arr.length - 1; i > insertPos; i--) {
            arr[i] = arr[i - 1];
        }
        // Insert the element
        arr[insertPos] = element;
    }

    //int index = binarySearch(myArray, address);
    function binarySearch(
        address[] memory arr,
        address target
    ) public pure returns (int256) {
        uint min = 0;
        uint max = arr.length - 1;
        while (min <= max) {
            uint mid = (min + max) / 2;
            if (arr[mid] < target) {
                min = mid + 1;
            } else if (arr[mid] > target) {
                max = mid - 1;
            } else {
                // Target found
                return int(mid);
            }
        }
        // Target not found
        return -1;
    }
}
