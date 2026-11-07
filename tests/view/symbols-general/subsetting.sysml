// subsetting: 使用の部分集合
package Fleet {
    part def Car {
        part wheels[4];
        part frontWheels[2] :> wheels;
    }
}
