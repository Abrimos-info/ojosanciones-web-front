const { Client } = require('@elastic/elasticsearch')

const pageSize = 20;


async function queryRepresentaciones(nit) {
    let index = gt_proveedores_index;

    let filtro = {
        "term": {
            "representantes_legales.nit.keyword": nit
        }
    }

    let searchDocument = {
        "index": index,
        "size": 300,
        "query": filtro
    }

    // console.log(searchDocument);
    const result = await client.search(searchDocument)


    // console.log(result.hits.hits);
    return { hits: result.hits.hits } ;
 

}
//Get information from database

async function queryItem(type,id,country,relations) {
    let index = getIndex[type];
    let filtro = {
        "bool": {
            "must": [
                {
                    "match_phrase": {
                        "id": id
                    }
                },
                {
                  "term": {
                    "country.keyword": {
                      "value": country
                    }
                  }
                }


            ]
        }
    }

    let searchDocument = {
        "index": index,
        "size": 1,
        "query": filtro,
    }

    let result = await client.search(searchDocument)

    if (result.hits.hits.length > 0) {
        for (let r in relations) {
            const relationResult = await queryRelation(result.hits.hits[0],relations[r],country);
            if (relationResult) {
                // console.log("rel",r,relations[r].type,relationResult.length)
                result.hits.hits[0]._source[relations[r].type] = relationResult;
            }
        
        }
    }
    return result.hits.hits[0];

}

async function queryRelation(result,relation,country) {
    // console.log(result,relation);
    let indexR = "gob_"+relation.type+"}";
    let field_b_value = result._source[relation.field_b];
    if (!field_b_value) {
        console.log("Missing value for",relation.field_b, "in result",result);
        return;
    }
    let filtroR = null;

    if (!Array.isArray(field_b_value)) {
        filtroR = {
            "match_phrase": {
                [relation.field_a]:  field_b_value

            }
        }
    }
    else {

        filtroR = { 
            "terms": {
                [relation.field_a]:  field_b_value
                
            }
        }
    }

    if(country) {

        filtroR = {
            "bool": {
                "must": [
                    filtroR,
                    {
                    "term": {
                        "country.keyword": {
                        "value": country
                        }
                    }
                    }
        
        
                ]
            }

        }    
    }

    let searchDocumentR = {
        "index": indexR,
        "size": 100,
        "query": filtroR,
    }

    // console.log("searchDocumentR",JSON.stringify(searchDocumentR));
    let resultR = await client.search(searchDocumentR);
    // console.log("relation",relation,resultR)

    for (let r in relation.relations) {
        for (h in resultR.hits.hits) {
            let relationResult = await queryRelation(resultR.hits.hits[h],relation.relations[r],country);
            if (relationResult) {
                resultR.hits.hits[h]._source[relation.relations[r].type] = relationResult;
            }
        }
    
    }

    if (resultR.hits.hits.length == 1) {
        return resultR.hits.hits[0]._source
    }
    if (resultR.hits.hits.length > 1) {
        return resultR.hits.hits.map(h=>h._source)
    }

}

const type_indexes = {
    "sancion": "gt_guatecompras"
}


function getIndex(type) {
    if (type_indexes.hasOwnProperty(type)) {
        return type_indexes[type];
    }
    else {
        throw(new Error("No index defined for type "+type));
    }
    
}

async function queryKeywords(filters) {
    let index = "";
    let size = pageSize;
    let from = size*filters.page.value || 0;
    let highlight = {};
    let sort = {}
    index = getIndex(filters.type.value);

    // console.log("queryKeywords",keyword);
    let filtro = null;
    
    if (filters.country) {

        filtro = {
            match_phrase: {
                "country": country
            }
        }
    }
    else {
        filtro = {
            match_all: {}
        }
    }

//     if (id) {
//         filtro = {
//             "term": {
//                 "id": id
//             }
//         }
// // switch (type) {
// //             case "person":
// //                 size = 200;
// //                 filtro = {
// //                     "multi_match": {
// //                         "query": id,
// //                         "fields": [
// //                             "nog_concurso.keyword",
// //                             "unidad_compradora.keyword",
// //                         ]
// //                     }

// //                 }

// //                 break;
// //             case "area":
// //                 break;
// //             case "person":
// //                 filtro = {
// //                     "term": {
// //                         "id": id
// //                     }
// //                 }
// //                 break;
    
// //         }
// //     }
//     }

    if (filters.keyword) {
        switch (type) {
            case "contract":
                filtro = {
                    "multi_match": {
                        "query": keyword,
                        "type": "phrase",
                        "fields": [
                            "nombre",
                            "nombre.keyword",
                            "descripcion",
                            "descripcion.keyword",
                            "nit.keyword",
                            "nog_concurso.keyword"
                        ]
                    }
                }

                highlight = {
                    "fields": {
                        "nombre": {},
                        "descripcion": {},
                        "nit": {}
                    }
                }
                sort = {
                    "monto": "desc"
                }

                break;
            case "supplier":
                filtro = {
                    "multi_match": {
                        "query": keyword,
                        "fields": [
                            "nombre_razon_social",
                            "nombres_comerciales",
                            "nombre_persona",
                            "representantes_legales.nombre"
                        ]
                    }
                }

                highlight = {
                    "fields": {
                        "nombre_razon_social": {},
                        "nombres_comerciales": {},
                        "nombre_persona": {},
                        "representantes_legales.nombre": {}
                    }
                }

                break;
        }
    }
    
    let searchDocument = {
        "index": index,
        "size": size,
        "from": from,
        "highlight": highlight,
        "query": filtro,
        "sort": sort
    }

    // console.log(searchDocument);
    const result = await client.search(searchDocument)


    // console.log(result.hits.hits);
    return { hits: result.hits.hits, aggregations: result.aggregations, pages: { total: result.hits.total  }} ;
}


async function queryBuyer(name,page) {
    name = decodeURI(name);
    let index = args.elastic_index;
    let limit = 1;

    let filtro = {
        "multi_match": {
            "query": name,
            "type": "phrase",            
            "fields": [
                "entidad_compradora",
                "unidad_compradora"
            ]
        }
    }


    let searchDocument = {
        "index": index,
        "size": limit,
        "query": filtro,
        // "sort": {
        //     "fecha_publicacion": "desc"
        // }
    }

    searchDocument.aggs = {
        
        "count": {
            "cardinality": {
                "field": "entidad_compradora.keyword"
            }
        },
        "name": {
            "terms": {
                "size": 500,
                "field": "entidad_compradora.keyword" //equivale a dependencia, es el dato más importante
            },
            "aggs": {
                "unidad_compradora": {
                    "terms": {
                        field: "unidad_compradora.keyword",// es la subdivisión de la dependencia que realiza la compra
                        size: 100
                    }
                },
                "tipo_entidad_padre": {
                    "terms": {
                        field: "tipo_entidad_padre.keyword"// es la subdivisión de la dependencia que realiza la compra
                    }
                },
                "tipo_entidad": {
                    "terms": {
                        field: "tipo_entidad.keyword"// es la subdivisión de la dependencia que realiza la compra
                    }
                },
                "contract_amount": {
                    "sum": {
                        field: "monto"// es la subdivisión de la dependencia que realiza la compra
                    }
                },
            }
        },
    }

    const result = await client.search(searchDocument)
    // console.log(result.aggregations.name);


    // console.log("a",result.aggregations.count.value);
    return { hits: result.aggregations.name.buckets, pages: { total: result.aggregations.count  } } ;
}
async function queryStats() {


    let index = args.elastic_index;
    let limit = 1;



    let searchDocument = {
        "index": index,
        "size": limit,
    }

    searchDocument.aggs = {
        "supplier_count": {
            "cardinality": {
                "field": "nit"
            }
        }
    }

    // console.log(searchDocument);
    const result = await client.search(searchDocument)
    // console.log(result);

    let searchDocument2 = {
        "index": args.elastic_index,
        "size": limit,
    }

    searchDocument2.aggs = {
        "contract_count": {
            "value_count": {
                "field": "nog_concurso"
            }
        },
        "buyer_count": {
            "cardinality": {
                "field": "entidad_compradora"
            }
        },
        "last_update": {
            "max": {
                "field": "fecha_ultima_adjudicacion"
            }
        }
    }

    // console.log(searchDocument2);
    const result2 = await client.search(searchDocument2)
    // console.log(result2);

    // console.log(result.aggregations.name.buckets);
    const stats = {
        last_update: result2.aggregations.last_update.value,
        contract_count: result2.aggregations.contract_count.value,
        buyer_count: result2.aggregations.buyer_count.value,
        supplier_count: result.aggregations.supplier_count.value
    }
    return stats;
}



let args = {};
let client = null;
//Connect to ElasticSearch
async function connect(uri,localargs) {
    args = localargs;

    return new Promise((resolve,reject)=>{

        const esclient = new Client({
            node: uri,
            tls: {
                rejectUnauthorized: false
            }
    
        })
        // this.client = client;
    
        try {
            esclient.info().catch((e, d) => {
                esclient.search = () => {
                    const mockData = require("./mockData.json");
                    return mockData;
                }
                // console.log("DB Failed");
                console.log("DB ERROR",e.message);
                reject(e);
    
            })
                .then((res) => {
                    if (res) {
                        console.log("DB connected", res.name,res.version.number);
                        client = esclient;
                        resolve();
                    }
                    else {
                        reject(res);
                    }
                    //console.log(res);
                })
        }
        catch (e) {
            console.error("Elastic couldn't connect")
        }
    
    })

}

module.exports = {
    connect, queryItem, queryKeywords, queryStats, pageSize, type_indexes
}