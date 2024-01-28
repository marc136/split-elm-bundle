#!/bin/env bash

# compile the js bundle
elm make --optimize --output=www/examples.js src/Animation.elm src/Clock.elm src/Cube.elm src/Mouse.elm src/Quotes.elm src/TextField.elm 

# split the bundle
node ../../bin/split-elm-bundle.mjs www/examples.js
