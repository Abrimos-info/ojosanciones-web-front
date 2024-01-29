const fs = require('fs');
const pug = require('pug');

const db = require("./db");

const pugLocals = {
    fechaFormateada: function(dateString) {
        if (!dateString) return null;
        const fecha = new Date(dateString); // Aquí tendrías tu fecha específica
        if (fecha == "Invalid Date") {
            return dateString+".";
        }
        // Formatear la fecha
        const options = { year: 'numeric', month: '2-digit', day: '2-digit'};
        const fechaFormateada = fecha.toLocaleDateString('es-MX', options);

        return fechaFormateada

    },
    num: function(cifra,unidad) {
        let numero = Number(cifra);
        let uni = unidad ? unidad + " " : "";
        return uni+numero.toLocaleString("es-GT");
    },
    enc: encodeURIComponent,
    modifySearchParams(searchParams,param,value) {
        searchParams.set(param,value);
        return "?"+searchParams.toString();
        // return newSearchParams;
    },
    j: function(object) {
        return JSON.stringify(object)
    },
    jp: function(object) {
        return "<pre>"+JSON.stringify(object).replace(/(,)/g,"$1\n").replace(/([\{\}])/g,"\n$1\n")+"</pre>"
    }
}


function errorPage(req,res) {
    let url = new URL(req.url, "http://localhost");

    console.log(new Date(), "404",url.pathname)
    return {
        status: 404,
        html: `<h1>La página pedida ${url.pathname} no se encontró (404)</h1>`
    }
}

function return404(country,type, id) {
    console.log(new Date(), "404",country,type, id)
    let status = 404;
    html = `<h1>El item ${country} ${type} ${id} no se encontró (404)</h1>`;
    return {
        html: html,
        status: status
    }
}

async function itemPage  (req,type,rel) {
    let result = null;
    let html = null;
    let url = new URL(req.url, "http://localhost");
    let status;
    // console.log(url.pathname.split("/"));
    let id = url.pathname.split("/")[3];
    let country = url.pathname.split("/")[1];
    if (!id) { return return404(country,type, id)}
    result = await db.queryItem(type, id, country, rel);
    // console.log(result);
    if (result) {
        console.log(new Date(), type, "id",id)
        html = pug.renderFile("templates/person.pug",{item: result, pages: result.pages, ... pugLocals});
        status = 200;
    }
    else {
        return return404(country,type, id)

    }
    return {
        html: html,
        status: status
    }
}

async function homePage(req,res) {
    // let result = await queryKeywords();
    let stats = await db.queryStats();
    console.log(new Date(), "home")

    return {
        html: pug.renderFile("templates/home.pug",{stats: stats, ... pugLocals} ),
        status: 200
    }
}

async function areaPage  (req,res) {
    return await itemPage(req,"area",[
        {
            type: "chamber",
            field_a: "area_id",
            field_b: "id"
        },
        {
            type: "party", //NO ANDA
            field_a: "area_id",
            field_b: "id"
        },
        {
            type: "contest",
            field_a: "area_id",
            field_b: "id",
        }

    ])    
}

async function contestPage  (req,res) {
    return await itemPage(req,"contest",[
        {
            type: "person",
            field_a: "contest_id",
            field_b: "id"
        }
    ])
}

async function partyPage  (req,res) {
    return await itemPage(req,"party",[
        {
            type: "area",
            field_a: "id",
            field_b: "area_id"
        },
        {
            type: "membership", 
            field_a: "party_ids",
            field_b: "id",
            relations: [
                {
                    type: "person",
                    field_a: "id",
                    field_b: "person_id"
                }
        
            ]
        }

    ])
}

async function personPage(req,res) {
    return await itemPage(req,"person",[
        {
            type: "contest",
            field_a: "id",
            field_b: "contest_id"
        },
        {
            type: "membership",
            field_a: "person_id",
            field_b: "id", 
            relations: [
                {
                    type: "role",
                    field_a: "id",
                    field_b: "role_id"
                },
                {
                    type: "party",
                    field_a: "id",
                    field_b: "party_ids"
                },        
            ]
        },
    ])
}



async function buscadorPage(req,res) {
    let url = new URL(req.url, "http://localhost");

    const keyword = url.searchParams.get("keyword");
    const type = url.searchParams.get("type");
    const country = url.searchParams.get("country");
    const page = url.searchParams.get("page") > 0 ? url.searchParams.get("page") - 1 : 0;
    
    console.log(new Date(), "buscadorPage",keyword,type,page,country)
    let result = await db.queryKeywords(keyword,country,type,page);

    let result_count = result.pages.total.value;
    let locals = {
        keyword: keyword,
        country: country,
        pages: Math.ceil(result_count/db.pageSize),
        pageSize: db.pageSize,
        currentPage: page,
        searchParams: url.searchParams,
        result_count: result_count, 
        type: type
    }

    // console.log(locals,result_count);

    return {
        html: pug.renderFile("templates/buscador.pug",{results: result.hits, ... locals, ... pugLocals} ),
        status: 200
    }

}


function sendStatic(req,response) {
    let url = new URL(req.url, "http://localhost");
    let urlpoint = url.pathname.split(".");
    var extname = "."+urlpoint[urlpoint.length-1];
    console.log(new Date(), "static",url.pathname);

    var contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
        case '.wav':
            contentType = 'audio/wav';
            break;
    }

    fs.readFile(__dirname + "/.." + url.pathname, function(error, content) {
        if (error) {
            if(error.code == 'ENOENT'){
                response.writeHead(200, { 'Content-Type': contentType });
                content = "Error 404"
                response.end(content, 'utf-8');
                console.log("Static not found",error.path);
            }
            else {
                response.writeHead(500);
                response.end('Sorry, check with the site admin for error: '+error.code+' ..\n');
                response.end();
                console.log("Static error",error);
            }
        }
        else {
            response.writeHead(200, { 'Content-Type': contentType });
            response.end(content, 'utf-8');
        }
    });
    return {status: 0};
}

async function countryPage(req,res) {
    let url = new URL(req.url, "http://localhost");
    let country = url.pathname.split("/")[1];

    // let stats = await db.queryStats();
    console.log(new Date(), "countryPage")

    return {
        html: pug.renderFile("templates/country.pug",{stats: {}, country: country, ... pugLocals} ),
        status: 200
    }

}

const requestListener = async function (req, res) {
    let url = new URL(req.url, "http://localhost");
    let responseData = null;
    let route = null;

    try {
        let routeLevel1 = url.pathname.split("/")[1];
        let routeLevel2 = null;
        // console.log(routeLevel1);
        let generationStartDate = new Date();
        if (routeLevel1!="static") {

            console.time("Page generation time "+url.pathname)
        }
    
        if (!routes.hasOwnProperty(routeLevel1)) {
            route="default";
        }

        if (typeof routes[routeLevel1] == "function") {
            responseData = await routes[routeLevel1](req, res);
        }
        else {

            routeLevel2 = url.pathname.split("/")[2];
            if (typeof routes[routeLevel1][routeLevel2] == "function") {
                responseData = await routes[routeLevel1][routeLevel2](req, res);
            }
        } 


        // console.log(routeLevel1,routeLevel2);
        if (routeLevel1!="static") {

            console.timeEnd("Page generation time "+url.pathname)
        }
    
    
    }
    catch(e) {
        console.log(new Date(), "500",url.pathname,e);
        // res.setHeader("Content-Type", "text/html; charset=utf-8");
        responseData = {
            html: `<h1>La página pedida tuvo un error al generarse</h1><p>${JSON.stringify(e)}</p>`,
            status: 500
        }

    }

    if (responseData) {

        if (responseData.status !== 0) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.writeHead(responseData.status);
            res.end(responseData.html);
        }
        else {
            // if (res.writable) {
            //         console.error("Finished with writable response.",res);
            //         res.setHeader("Content-Type", "text/html; charset=utf-8");
            //         res.writeHead(502);
            //         res.end("Error 502");


            //     }
        }
    }
    else {
        console.error("No responseData 501");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.writeHead(501);
        res.end("Error 501");
    }


    return false;
};



const countryRoutes = {
    "": countryPage,
    "area": areaPage,
    "contest": contestPage,
    "person": personPage,
    "party": partyPage,
    
};

const routes = {
    "": homePage,
    "static": sendStatic,
    "default": errorPage,
    "buscador": buscadorPage,
    "AR": countryRoutes,
    "CO": countryRoutes,
    "MX": countryRoutes
}

module.exports = { routes, requestListener }