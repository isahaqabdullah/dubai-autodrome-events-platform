"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "app/api/qr/route";
exports.ids = ["app/api/qr/route"];
exports.modules = {

/***/ "next/dist/compiled/next-server/app-page.runtime.dev.js":
/*!*************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-page.runtime.dev.js" ***!
  \*************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-page.runtime.dev.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-route.runtime.dev.js":
/*!**************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-route.runtime.dev.js" ***!
  \**************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-route.runtime.dev.js");

/***/ }),

/***/ "assert":
/*!*************************!*\
  !*** external "assert" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("assert");

/***/ }),

/***/ "buffer":
/*!*************************!*\
  !*** external "buffer" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("buffer");

/***/ }),

/***/ "fs":
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
/***/ ((module) => {

module.exports = require("fs");

/***/ }),

/***/ "stream":
/*!*************************!*\
  !*** external "stream" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("stream");

/***/ }),

/***/ "util":
/*!***********************!*\
  !*** external "util" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("util");

/***/ }),

/***/ "zlib":
/*!***********************!*\
  !*** external "zlib" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("zlib");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fqr%2Froute&page=%2Fapi%2Fqr%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fqr%2Froute.ts&appDir=%2FUsers%2Fisq%2FDocuments%2FEvent%20Registration%20App%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fisq%2FDocuments%2FEvent%20Registration%20App&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fqr%2Froute&page=%2Fapi%2Fqr%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fqr%2Froute.ts&appDir=%2FUsers%2Fisq%2FDocuments%2FEvent%20Registration%20App%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fisq%2FDocuments%2FEvent%20Registration%20App&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   originalPathname: () => (/* binding */ originalPathname),\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   requestAsyncStorage: () => (/* binding */ requestAsyncStorage),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   staticGenerationAsyncStorage: () => (/* binding */ staticGenerationAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/future/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/future/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/future/route-kind */ \"(rsc)/./node_modules/next/dist/server/future/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _Users_isq_Documents_Event_Registration_App_app_api_qr_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./app/api/qr/route.ts */ \"(rsc)/./app/api/qr/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/qr/route\",\n        pathname: \"/api/qr\",\n        filename: \"route\",\n        bundlePath: \"app/api/qr/route\"\n    },\n    resolvedPagePath: \"/Users/isq/Documents/Event Registration App/app/api/qr/route.ts\",\n    nextConfigOutput,\n    userland: _Users_isq_Documents_Event_Registration_App_app_api_qr_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } = routeModule;\nconst originalPathname = \"/api/qr/route\";\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        serverHooks,\n        staticGenerationAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIuanM/bmFtZT1hcHAlMkZhcGklMkZxciUyRnJvdXRlJnBhZ2U9JTJGYXBpJTJGcXIlMkZyb3V0ZSZhcHBQYXRocz0mcGFnZVBhdGg9cHJpdmF0ZS1uZXh0LWFwcC1kaXIlMkZhcGklMkZxciUyRnJvdXRlLnRzJmFwcERpcj0lMkZVc2VycyUyRmlzcSUyRkRvY3VtZW50cyUyRkV2ZW50JTIwUmVnaXN0cmF0aW9uJTIwQXBwJTJGYXBwJnBhZ2VFeHRlbnNpb25zPXRzeCZwYWdlRXh0ZW5zaW9ucz10cyZwYWdlRXh0ZW5zaW9ucz1qc3gmcGFnZUV4dGVuc2lvbnM9anMmcm9vdERpcj0lMkZVc2VycyUyRmlzcSUyRkRvY3VtZW50cyUyRkV2ZW50JTIwUmVnaXN0cmF0aW9uJTIwQXBwJmlzRGV2PXRydWUmdHNjb25maWdQYXRoPXRzY29uZmlnLmpzb24mYmFzZVBhdGg9JmFzc2V0UHJlZml4PSZuZXh0Q29uZmlnT3V0cHV0PSZwcmVmZXJyZWRSZWdpb249Jm1pZGRsZXdhcmVDb25maWc9ZTMwJTNEISIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7QUFBc0c7QUFDdkM7QUFDYztBQUNlO0FBQzVGO0FBQ0E7QUFDQTtBQUNBLHdCQUF3QixnSEFBbUI7QUFDM0M7QUFDQSxjQUFjLHlFQUFTO0FBQ3ZCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQSxZQUFZO0FBQ1osQ0FBQztBQUNEO0FBQ0E7QUFDQTtBQUNBLFFBQVEsaUVBQWlFO0FBQ3pFO0FBQ0E7QUFDQSxXQUFXLDRFQUFXO0FBQ3RCO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDdUg7O0FBRXZIIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vZHViYWktYXV0b2Ryb21lLWV2ZW50LXJlZ2lzdHJhdGlvbi8/MThiMyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvZnV0dXJlL3JvdXRlLW1vZHVsZXMvYXBwLXJvdXRlL21vZHVsZS5jb21waWxlZFwiO1xuaW1wb3J0IHsgUm91dGVLaW5kIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvZnV0dXJlL3JvdXRlLWtpbmRcIjtcbmltcG9ydCB7IHBhdGNoRmV0Y2ggYXMgX3BhdGNoRmV0Y2ggfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9saWIvcGF0Y2gtZmV0Y2hcIjtcbmltcG9ydCAqIGFzIHVzZXJsYW5kIGZyb20gXCIvVXNlcnMvaXNxL0RvY3VtZW50cy9FdmVudCBSZWdpc3RyYXRpb24gQXBwL2FwcC9hcGkvcXIvcm91dGUudHNcIjtcbi8vIFdlIGluamVjdCB0aGUgbmV4dENvbmZpZ091dHB1dCBoZXJlIHNvIHRoYXQgd2UgY2FuIHVzZSB0aGVtIGluIHRoZSByb3V0ZVxuLy8gbW9kdWxlLlxuY29uc3QgbmV4dENvbmZpZ091dHB1dCA9IFwiXCJcbmNvbnN0IHJvdXRlTW9kdWxlID0gbmV3IEFwcFJvdXRlUm91dGVNb2R1bGUoe1xuICAgIGRlZmluaXRpb246IHtcbiAgICAgICAga2luZDogUm91dGVLaW5kLkFQUF9ST1VURSxcbiAgICAgICAgcGFnZTogXCIvYXBpL3FyL3JvdXRlXCIsXG4gICAgICAgIHBhdGhuYW1lOiBcIi9hcGkvcXJcIixcbiAgICAgICAgZmlsZW5hbWU6IFwicm91dGVcIixcbiAgICAgICAgYnVuZGxlUGF0aDogXCJhcHAvYXBpL3FyL3JvdXRlXCJcbiAgICB9LFxuICAgIHJlc29sdmVkUGFnZVBhdGg6IFwiL1VzZXJzL2lzcS9Eb2N1bWVudHMvRXZlbnQgUmVnaXN0cmF0aW9uIEFwcC9hcHAvYXBpL3FyL3JvdXRlLnRzXCIsXG4gICAgbmV4dENvbmZpZ091dHB1dCxcbiAgICB1c2VybGFuZFxufSk7XG4vLyBQdWxsIG91dCB0aGUgZXhwb3J0cyB0aGF0IHdlIG5lZWQgdG8gZXhwb3NlIGZyb20gdGhlIG1vZHVsZS4gVGhpcyBzaG91bGRcbi8vIGJlIGVsaW1pbmF0ZWQgd2hlbiB3ZSd2ZSBtb3ZlZCB0aGUgb3RoZXIgcm91dGVzIHRvIHRoZSBuZXcgZm9ybWF0LiBUaGVzZVxuLy8gYXJlIHVzZWQgdG8gaG9vayBpbnRvIHRoZSByb3V0ZS5cbmNvbnN0IHsgcmVxdWVzdEFzeW5jU3RvcmFnZSwgc3RhdGljR2VuZXJhdGlvbkFzeW5jU3RvcmFnZSwgc2VydmVySG9va3MgfSA9IHJvdXRlTW9kdWxlO1xuY29uc3Qgb3JpZ2luYWxQYXRobmFtZSA9IFwiL2FwaS9xci9yb3V0ZVwiO1xuZnVuY3Rpb24gcGF0Y2hGZXRjaCgpIHtcbiAgICByZXR1cm4gX3BhdGNoRmV0Y2goe1xuICAgICAgICBzZXJ2ZXJIb29rcyxcbiAgICAgICAgc3RhdGljR2VuZXJhdGlvbkFzeW5jU3RvcmFnZVxuICAgIH0pO1xufVxuZXhwb3J0IHsgcm91dGVNb2R1bGUsIHJlcXVlc3RBc3luY1N0b3JhZ2UsIHN0YXRpY0dlbmVyYXRpb25Bc3luY1N0b3JhZ2UsIHNlcnZlckhvb2tzLCBvcmlnaW5hbFBhdGhuYW1lLCBwYXRjaEZldGNoLCAgfTtcblxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9YXBwLXJvdXRlLmpzLm1hcCJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fqr%2Froute&page=%2Fapi%2Fqr%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fqr%2Froute.ts&appDir=%2FUsers%2Fisq%2FDocuments%2FEvent%20Registration%20App%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fisq%2FDocuments%2FEvent%20Registration%20App&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./app/api/qr/route.ts":
/*!*****************************!*\
  !*** ./app/api/qr/route.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   GET: () => (/* binding */ GET)\n/* harmony export */ });\n/* harmony import */ var _lib_qr__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @/lib/qr */ \"(rsc)/./lib/qr.ts\");\n\nasync function GET(request) {\n    const { searchParams } = new URL(request.url);\n    const token = searchParams.get(\"token\");\n    if (!token) {\n        return new Response(\"Missing token\", {\n            status: 400\n        });\n    }\n    const png = await (0,_lib_qr__WEBPACK_IMPORTED_MODULE_0__.generateQrPngBuffer)(token);\n    return new Response(png, {\n        headers: {\n            \"Content-Type\": \"image/png\",\n            \"Cache-Control\": \"private, no-store\"\n        }\n    });\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9hcHAvYXBpL3FyL3JvdXRlLnRzIiwibWFwcGluZ3MiOiI7Ozs7O0FBQStDO0FBRXhDLGVBQWVDLElBQUlDLE9BQWdCO0lBQ3hDLE1BQU0sRUFBRUMsWUFBWSxFQUFFLEdBQUcsSUFBSUMsSUFBSUYsUUFBUUcsR0FBRztJQUM1QyxNQUFNQyxRQUFRSCxhQUFhSSxHQUFHLENBQUM7SUFFL0IsSUFBSSxDQUFDRCxPQUFPO1FBQ1YsT0FBTyxJQUFJRSxTQUFTLGlCQUFpQjtZQUFFQyxRQUFRO1FBQUk7SUFDckQ7SUFFQSxNQUFNQyxNQUFNLE1BQU1WLDREQUFtQkEsQ0FBQ007SUFFdEMsT0FBTyxJQUFJRSxTQUFTRSxLQUFLO1FBQ3ZCQyxTQUFTO1lBQ1AsZ0JBQWdCO1lBQ2hCLGlCQUFpQjtRQUNuQjtJQUNGO0FBQ0YiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9kdWJhaS1hdXRvZHJvbWUtZXZlbnQtcmVnaXN0cmF0aW9uLy4vYXBwL2FwaS9xci9yb3V0ZS50cz82YmNhIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGdlbmVyYXRlUXJQbmdCdWZmZXIgfSBmcm9tIFwiQC9saWIvcXJcIjtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIEdFVChyZXF1ZXN0OiBSZXF1ZXN0KSB7XG4gIGNvbnN0IHsgc2VhcmNoUGFyYW1zIH0gPSBuZXcgVVJMKHJlcXVlc3QudXJsKTtcbiAgY29uc3QgdG9rZW4gPSBzZWFyY2hQYXJhbXMuZ2V0KFwidG9rZW5cIik7XG5cbiAgaWYgKCF0b2tlbikge1xuICAgIHJldHVybiBuZXcgUmVzcG9uc2UoXCJNaXNzaW5nIHRva2VuXCIsIHsgc3RhdHVzOiA0MDAgfSk7XG4gIH1cblxuICBjb25zdCBwbmcgPSBhd2FpdCBnZW5lcmF0ZVFyUG5nQnVmZmVyKHRva2VuKTtcblxuICByZXR1cm4gbmV3IFJlc3BvbnNlKHBuZywge1xuICAgIGhlYWRlcnM6IHtcbiAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiaW1hZ2UvcG5nXCIsXG4gICAgICBcIkNhY2hlLUNvbnRyb2xcIjogXCJwcml2YXRlLCBuby1zdG9yZVwiXG4gICAgfVxuICB9KTtcbn1cbiJdLCJuYW1lcyI6WyJnZW5lcmF0ZVFyUG5nQnVmZmVyIiwiR0VUIiwicmVxdWVzdCIsInNlYXJjaFBhcmFtcyIsIlVSTCIsInVybCIsInRva2VuIiwiZ2V0IiwiUmVzcG9uc2UiLCJzdGF0dXMiLCJwbmciLCJoZWFkZXJzIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./app/api/qr/route.ts\n");

/***/ }),

/***/ "(rsc)/./lib/qr.ts":
/*!*******************!*\
  !*** ./lib/qr.ts ***!
  \*******************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   QR_EMAIL_CONTENT_ID: () => (/* binding */ QR_EMAIL_CONTENT_ID),\n/* harmony export */   QR_EMAIL_FILENAME: () => (/* binding */ QR_EMAIL_FILENAME),\n/* harmony export */   buildQrEmailAttachment: () => (/* binding */ buildQrEmailAttachment),\n/* harmony export */   buildQrEmailCid: () => (/* binding */ buildQrEmailCid),\n/* harmony export */   buildQrPayload: () => (/* binding */ buildQrPayload),\n/* harmony export */   generateQrDataUrl: () => (/* binding */ generateQrDataUrl),\n/* harmony export */   generateQrPngBuffer: () => (/* binding */ generateQrPngBuffer)\n/* harmony export */ });\n/* harmony import */ var server_only__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! server-only */ \"(rsc)/./node_modules/next/dist/compiled/server-only/empty.js\");\n/* harmony import */ var server_only__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(server_only__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var qrcode__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! qrcode */ \"(rsc)/./node_modules/qrcode/lib/index.js\");\n\n\nconst QR_EMAIL_CONTENT_ID = \"registration-qr\";\nconst QR_EMAIL_FILENAME = \"registration-qr.png\";\nfunction buildQrPayload(token) {\n    return token;\n}\nasync function generateQrDataUrl(payload) {\n    return qrcode__WEBPACK_IMPORTED_MODULE_1__.toDataURL(payload, {\n        margin: 1,\n        width: 360,\n        errorCorrectionLevel: \"M\"\n    });\n}\nasync function generateQrPngBuffer(payload) {\n    return qrcode__WEBPACK_IMPORTED_MODULE_1__.toBuffer(payload, {\n        margin: 1,\n        width: 360,\n        type: \"png\",\n        errorCorrectionLevel: \"M\"\n    });\n}\nfunction buildQrEmailCid(contentId = QR_EMAIL_CONTENT_ID) {\n    return `cid:${contentId}`;\n}\nasync function buildQrEmailAttachment(token) {\n    return {\n        content: await generateQrPngBuffer(buildQrPayload(token)),\n        filename: QR_EMAIL_FILENAME,\n        contentType: \"image/png\",\n        contentId: QR_EMAIL_CONTENT_ID\n    };\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9saWIvcXIudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7OztBQUFxQjtBQUNPO0FBRXJCLE1BQU1DLHNCQUFzQixrQkFBa0I7QUFDOUMsTUFBTUMsb0JBQW9CLHNCQUFzQjtBQUVoRCxTQUFTQyxlQUFlQyxLQUFhO0lBQzFDLE9BQU9BO0FBQ1Q7QUFFTyxlQUFlQyxrQkFBa0JDLE9BQWU7SUFDckQsT0FBT04sNkNBQWdCLENBQUNNLFNBQVM7UUFDL0JFLFFBQVE7UUFDUkMsT0FBTztRQUNQQyxzQkFBc0I7SUFDeEI7QUFDRjtBQUVPLGVBQWVDLG9CQUFvQkwsT0FBZTtJQUN2RCxPQUFPTiw0Q0FBZSxDQUFDTSxTQUFTO1FBQzlCRSxRQUFRO1FBQ1JDLE9BQU87UUFDUEksTUFBTTtRQUNOSCxzQkFBc0I7SUFDeEI7QUFDRjtBQUVPLFNBQVNJLGdCQUFnQkMsWUFBWWQsbUJBQW1CO0lBQzdELE9BQU8sQ0FBQyxJQUFJLEVBQUVjLFVBQVUsQ0FBQztBQUMzQjtBQUVPLGVBQWVDLHVCQUF1QlosS0FBYTtJQUN4RCxPQUFPO1FBQ0xhLFNBQVMsTUFBTU4sb0JBQW9CUixlQUFlQztRQUNsRGMsVUFBVWhCO1FBQ1ZpQixhQUFhO1FBQ2JKLFdBQVdkO0lBQ2I7QUFDRiIsInNvdXJjZXMiOlsid2VicGFjazovL2R1YmFpLWF1dG9kcm9tZS1ldmVudC1yZWdpc3RyYXRpb24vLi9saWIvcXIudHM/ZmQyYyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgXCJzZXJ2ZXItb25seVwiO1xuaW1wb3J0IFFSQ29kZSBmcm9tIFwicXJjb2RlXCI7XG5cbmV4cG9ydCBjb25zdCBRUl9FTUFJTF9DT05URU5UX0lEID0gXCJyZWdpc3RyYXRpb24tcXJcIjtcbmV4cG9ydCBjb25zdCBRUl9FTUFJTF9GSUxFTkFNRSA9IFwicmVnaXN0cmF0aW9uLXFyLnBuZ1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRRclBheWxvYWQodG9rZW46IHN0cmluZykge1xuICByZXR1cm4gdG9rZW47XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVFyRGF0YVVybChwYXlsb2FkOiBzdHJpbmcpIHtcbiAgcmV0dXJuIFFSQ29kZS50b0RhdGFVUkwocGF5bG9hZCwge1xuICAgIG1hcmdpbjogMSxcbiAgICB3aWR0aDogMzYwLFxuICAgIGVycm9yQ29ycmVjdGlvbkxldmVsOiBcIk1cIlxuICB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlUXJQbmdCdWZmZXIocGF5bG9hZDogc3RyaW5nKSB7XG4gIHJldHVybiBRUkNvZGUudG9CdWZmZXIocGF5bG9hZCwge1xuICAgIG1hcmdpbjogMSxcbiAgICB3aWR0aDogMzYwLFxuICAgIHR5cGU6IFwicG5nXCIsXG4gICAgZXJyb3JDb3JyZWN0aW9uTGV2ZWw6IFwiTVwiXG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRRckVtYWlsQ2lkKGNvbnRlbnRJZCA9IFFSX0VNQUlMX0NPTlRFTlRfSUQpIHtcbiAgcmV0dXJuIGBjaWQ6JHtjb250ZW50SWR9YDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGJ1aWxkUXJFbWFpbEF0dGFjaG1lbnQodG9rZW46IHN0cmluZykge1xuICByZXR1cm4ge1xuICAgIGNvbnRlbnQ6IGF3YWl0IGdlbmVyYXRlUXJQbmdCdWZmZXIoYnVpbGRRclBheWxvYWQodG9rZW4pKSxcbiAgICBmaWxlbmFtZTogUVJfRU1BSUxfRklMRU5BTUUsXG4gICAgY29udGVudFR5cGU6IFwiaW1hZ2UvcG5nXCIsXG4gICAgY29udGVudElkOiBRUl9FTUFJTF9DT05URU5UX0lEXG4gIH07XG59XG4iXSwibmFtZXMiOlsiUVJDb2RlIiwiUVJfRU1BSUxfQ09OVEVOVF9JRCIsIlFSX0VNQUlMX0ZJTEVOQU1FIiwiYnVpbGRRclBheWxvYWQiLCJ0b2tlbiIsImdlbmVyYXRlUXJEYXRhVXJsIiwicGF5bG9hZCIsInRvRGF0YVVSTCIsIm1hcmdpbiIsIndpZHRoIiwiZXJyb3JDb3JyZWN0aW9uTGV2ZWwiLCJnZW5lcmF0ZVFyUG5nQnVmZmVyIiwidG9CdWZmZXIiLCJ0eXBlIiwiYnVpbGRRckVtYWlsQ2lkIiwiY29udGVudElkIiwiYnVpbGRRckVtYWlsQXR0YWNobWVudCIsImNvbnRlbnQiLCJmaWxlbmFtZSIsImNvbnRlbnRUeXBlIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./lib/qr.ts\n");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/qrcode","vendor-chunks/pngjs","vendor-chunks/dijkstrajs"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fqr%2Froute&page=%2Fapi%2Fqr%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fqr%2Froute.ts&appDir=%2FUsers%2Fisq%2FDocuments%2FEvent%20Registration%20App%2Fapp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=%2FUsers%2Fisq%2FDocuments%2FEvent%20Registration%20App&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();