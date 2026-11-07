// notes: 注釈と依存(これまでのビューと同じ記号)。about のない注はパッケージの外枠へ、doc は持ち主の箱へ線を引く
package Fleet {
    doc /* 車両の型 */
    part def Car {
        doc /* 乗用車 */
    }
    part def Truck;
    dependency uses from Truck to Car;
}
