const _ = 'lodash'


return _.map(collection, fn);
// должно замениться на 
if (Array.isArray(collection)) {
    return collection.map(fn);
} else {
    return _.map(collection, fn);
}

_.map(collection, fn);
// должно замениться на
if (Array.isArray(collection)) {
    collection.map(fn);
} else {
    _.map(collection, fn);
}



const x = _.map(collection, function test(){})

_.orderBy(collection, fn).orderBy(c,f).map(collection,fn)

_.flatten(_.map(a,f))

function test(x) { 
  return _.map(x,fn)
}





return (Array.isArray(collection)) ?
    collection.map(fn) :
    _.map(collection, fn);