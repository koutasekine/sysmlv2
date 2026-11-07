// reference-subsetting: 参照の部分集合
package Fleet {
    part def Car {
        part driver;
        ref part occupant ::> driver;
    }
}
