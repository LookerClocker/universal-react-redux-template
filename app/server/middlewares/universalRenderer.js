import React from 'react'
import ReactDOMServer from 'react-dom/server'
import {useRouterHistory, RouterContext, match} from 'react-router'
import {createMemoryHistory, useQueries} from 'history'
import Promise from 'bluebird'
import configureStore from 'store/configureStore'
import createRoutes from 'routes/index'
import {Provider} from 'react-redux'
import Helmet from 'react-helmet'
import util from 'util';

const fs = require('fs');
const path = require('path');

let scriptSrcs;
let styleSrc;

/**
 * Get css files and add them to index.ejs
 * @param srcpath
 * @returns {Array}
 */
function getFiles(srcpath) {
    let components = [];

    /**
     * First wrap level
     */
    for (let i = 0; i < fs.readdirSync(srcpath).length; i++) {
        if (fs.readdirSync(srcpath)[i].split('.').pop() === 'css') { // or js in future
            components.push(fs.readdirSync(srcpath)[i]);
        }
    }


    /**
     * Second wrap level
     */
    let directories = fs.readdirSync(srcpath)
        .filter(file => fs.lstatSync(path.join(srcpath, file)).isDirectory());

    for (let j = 0; j < directories.length; j++) {
        let arrayOfFiles = fs.readdirSync('dist/styles/' + directories[j]); // array of files in specific folder

        for (let i = 0; i < arrayOfFiles.length; i++) {
            if (arrayOfFiles[i].split('.').pop() === 'css') {
                components.push(directories[j] + '/' + arrayOfFiles[i]);
            }
        }

        /**
         * Third level
         */
        for (let i = 0; i < arrayOfFiles.length; i++) {

            let findInnerDirectories = fs.readdirSync(srcpath + '/' + directories[j]);

            let innerFolders = findInnerDirectories.filter(file => fs.lstatSync(path.join(srcpath + '/' + directories[j], file)).isDirectory());
            let innerCssFiles = fs.readdirSync(srcpath + '/' + directories[j] + '/' + innerFolders);

            for (let k = 0; k < innerCssFiles.length; k++) {

                if (innerCssFiles[k].split('.').pop() === 'css') {
                    components.push(directories[j] + '/' + innerFolders + '/' + innerCssFiles[k]);
                }
            }

        }
    }

    return components;
}

if (process.env.NODE_ENV === 'production') {
    let refManifest = require('../../rev-manifest.json')
    scriptSrcs = [
        `/${refManifest['vendor.js']}`,
        `/${refManifest['app.js']}`,
    ]
    styleSrc = `/${refManifest[getFiles('dist/styles')]}`
} else {
    scriptSrcs = [
        '/vendor.js',
        '/app.js'
    ]
    styleSrc = getFiles('dist/styles');
}


export default (req, res, next) => {
    let history = useRouterHistory(useQueries(createMemoryHistory))()
    let store = configureStore()
    let routes = createRoutes(history)
    let location = history.createLocation(req.url)

    match({routes, location}, (error, redirectLocation, renderProps) => {

        if (redirectLocation) {
            res.redirect(301, redirectLocation.pathname + redirectLocation.search)
        } else if (error) {
            res.status(500).send(error.message)
        } else if (renderProps == null) {
            res.status(404).send('Not found')
        } else {
            let [getCurrentUrl, unsubscribe] = subscribeUrl()
            let reqUrl = location.pathname + location.search

            getReduxPromise().then(() => {
                let reduxState = escape(JSON.stringify(store.getState()))
                let html = ReactDOMServer.renderToString(
                    <Provider store={store}>
                        { <RouterContext {...renderProps}/> }
                    </Provider>
                )
                let metaHeader = Helmet.rewind();

                if (getCurrentUrl() === reqUrl) {
                    res.render('index', {metaHeader, html, scriptSrcs, reduxState, styleSrc})
                } else {
                    res.redirect(302, getCurrentUrl())
                }
                unsubscribe()
            })
                .catch((err) => {
                    Helmet.rewind();
                    unsubscribe()
                    next(err)
                })
            function getReduxPromise() {
                let {query, params} = renderProps
                let comp = renderProps.components[renderProps.components.length - 1].WrappedComponent
                let promise = comp.fetchData ?
                    comp.fetchData({query, params, store, history}) :
                    Promise.resolve()

                return promise
            }
        }
    })
    function subscribeUrl() {
        let currentUrl = location.pathname + location.search
        let unsubscribe = history.listen((newLoc) => {
            if (newLoc.action === 'PUSH' || newLoc.action === 'REPLACE') {
                currentUrl = newLoc.pathname + newLoc.search
            }
        })
        return [
            () => currentUrl,
            unsubscribe
        ]
    }
}
