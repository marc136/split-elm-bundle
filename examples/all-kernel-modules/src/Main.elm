port module Main exposing (..)

{-| Import every elm kernel code file into this project

Some modules have special `Elm/Kernel/*.server.js` code that I don't know how to reach.

    ☐ elm/browser
        ☑ https://github.com/elm/browser/blob/1.0.2/src/Elm/Kernel/Browser.js
        ☐ https://github.com/elm/browser/blob/1.0.2/src/Elm/Kernel/Browser.server.js
        ☑ https://github.com/elm/browser/blob/1.0.2/src/Elm/Kernel/Debugger.js
            (need to compile with `--debug` flag)
    ☑ elm/bytes
        https://github.com/elm/bytes/blob/1.0.8/src/Elm/Kernel/Bytes.js
    ☐ elm/core
        ☑ https://github.com/elm/core/blob/1.0.5/src/Elm/Kernel/Basics.js
        ☑ https://github.com/elm/core/blob/1.0.5/src/Elm/Kernel/Bitwise.js
        ☑ https://github.com/elm/core/blob/1.0.5/src/Elm/Kernel/Char.js
        ☑ https://github.com/elm/core/blob/1.0.5/src/Elm/Kernel/Debug.js
        ☑ https://github.com/elm/core/blob/1.0.5/src/Elm/Kernel/JsArray.js
        ☑ https://github.com/elm/core/blob/1.0.5/src/Elm/Kernel/List.js
        ☑ https://github.com/elm/core/blob/1.0.5/src/Elm/Kernel/Platform.js
        ☑ https://github.com/elm/core/blob/1.0.5/src/Elm/Kernel/Process.js
        ☐ https://github.com/elm/core/blob/1.0.5/src/Elm/Kernel/Process.server.js
        ☑ https://github.com/elm/core/blob/1.0.5/src/Elm/Kernel/Scheduler.js
        ☑ https://github.com/elm/core/blob/1.0.5/src/Elm/Kernel/String.js
        ☑ https://github.com/elm/core/blob/1.0.5/src/Elm/Kernel/Utils.js
    ☑ elm/file
        https://github.com/elm/file/blob/1.0.5/src/Elm/Kernel/File.js
    ☑ elm/html
    ☐ elm/http
        ☑ https://github.com/elm/http/blob/2.0.0/src/Elm/Kernel/Http.js
        ☐ https://github.com/elm/http/blob/2.0.0/src/Elm/Kernel/Http.server.js
    ☑ elm/json
        https://github.com/elm/json/blob/1.1.3/src/Elm/Kernel/Json.js
    ☑ elm/parser
        https://github.com/elm/parser/blob/1.1.0/src/Elm/Kernel/Parser.js
    ☑ elm/project-metadata-utils
    ☑ elm/random
    ☑ elm/regex
        https://github.com/elm/regex/blob/1.0.0/src/Elm/Kernel/Regex.js
    ☑ elm/svg
    ☐ elm/time
        ☑ https://github.com/elm/time/blob/1.0.0/src/Elm/Kernel/Time.js
        ☐ https://github.com/elm/time/blob/1.0.0/src/Elm/Kernel/Time.server.js
    ☑ elm/url
        https://github.com/elm/url/blob/1.0.0/src/Elm/Kernel/Url.js
    ☐ elm/virtual-dom
        ☑ https://github.com/elm/virtual-dom/blob/1.0.3/src/Elm/Kernel/VirtualDom.js
        ☐ https://github.com/elm/virtual-dom/blob/1.0.3/src/Elm/Kernel/VirtualDom.server.js
    ☑ elm-explorations/linear-algebra
        https://github.com/elm-explorations/linear-algebra/blob/1.0.3/src/Elm/Kernel/MJS.js
    ☑ elm-explorations/webgl
        ☑ https://github.com/elm-explorations/webgl/blob/1.1.3/src/Elm/Kernel/Texture.js
        ☑ https://github.com/elm-explorations/webgl/blob/1.1.3/src/Elm/Kernel/WebGL.js
    ☐ elm-explorations/markdown
        not included because it contains a uglified chunk of code, see tests

-}

import Browser
import Browser.Navigation
import Bytes exposing (Bytes)
import Bytes.Encode
import File.Download
import Html exposing (Html)
import Html.Attributes
import Html.Events exposing (onClick)
import Http
import Json.Decode
import Json.Encode
import Math.Vector2
import Parser
import Regex
import Task
import Time
import Url exposing (Url)
import WebGL
import WebGL.Texture


main =
    Browser.application
        { init = init
        , update = update
        , subscriptions = subscriptions
        , onUrlChange = UrlChanged
        , onUrlRequest = LinkClicked
        , view = view
        }



-- MODEL


type alias Model =
    { number : Int
    , key : Browser.Navigation.Key
    , bytes : Bytes
    , time : Maybe Time.Posix
    , mesh : WebGL.Mesh Math.Vector2.Vec2
    , texture : Maybe WebGL.Texture.Texture
    }



-- INIT


init : Flags -> Url -> Browser.Navigation.Key -> ( Model, Cmd Msg )
init flags url key =
    ( { number =
            Json.Encode.int 1
                |> Json.Decode.decodeValue Json.Decode.int
                |> Result.withDefault 2
      , key = key
      , bytes = Bytes.Encode.unsignedInt8 1 |> Bytes.Encode.encode
      , time = Nothing
      , mesh = WebGL.lines [ ( Math.Vector2.vec2 0 0, Math.Vector2.vec2 0 1 ) ]
      , texture = Nothing
      }
    , [ outgoing ()
      , Task.perform Now Time.now
      , WebGL.Texture.load "missing.png" |> Task.attempt TextureLoaded
      ]
        |> Cmd.batch
    )


type alias Flags =
    -- Int
    ()



-- UPDATE


type Msg
    = NoOp
    | Increment
    | IncrementViaPort
    | LinkClicked Browser.UrlRequest
    | UrlChanged Url
    | HttpPost
    | HttpPostResult (Result Http.Error ())
    | DownloadFile
    | Now Time.Posix
    | TextureLoaded (Result WebGL.Texture.Error WebGL.Texture.Texture)


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        NoOp ->
            ( model, Cmd.none )

        Increment ->
            ( { model | number = model.number + 1 }, Cmd.none )

        IncrementViaPort ->
            ( model, outgoing () )

        LinkClicked (Browser.Internal url) ->
            ( model, Browser.Navigation.pushUrl model.key (Url.toString url) )

        LinkClicked (Browser.External href) ->
            if Regex.contains Regex.never href then
                ( model, Url.percentEncode "one" |> Browser.Navigation.load )

            else
                ( model, Browser.Navigation.load href )

        UrlChanged url ->
            let
                parse : String -> Maybe Int
                parse string =
                    Parser.run Parser.int string
                        |> Result.toMaybe
            in
            ( { model
                | number =
                    url.fragment
                        |> Maybe.andThen parse
                        |> Maybe.withDefault 0
              }
            , Cmd.none
            )

        HttpPost ->
            ( model
            , Http.request
                { method = "OPTIONS"
                , headers = []
                , url = "https://mw136.de"
                , body = Http.emptyBody
                , expect = Http.expectWhatever HttpPostResult
                , timeout = Just 3000
                , tracker = Just "options"
                }
            )

        HttpPostResult result ->
            ( model, Cmd.none )

        DownloadFile ->
            ( model
            , File.Download.string "hello.txt" "text/plain" "hello\n"
            )

        Now time ->
            ( { model | time = Just time }, Cmd.none )

        TextureLoaded (Err err) ->
            let
                _ =
                    Debug.log "Handle TextureLoaded error" err
            in
            ( { model | texture = Nothing }, Cmd.none )

        TextureLoaded (Ok texture) ->
            ( { model | texture = Just texture }, Cmd.none )



-- SUBSCRIPTION


subscriptions : Model -> Sub Msg
subscriptions model =
    incoming (always Increment)



-- PORTS


port outgoing : () -> Cmd msg


port incoming : (Int -> msg) -> Sub msg



-- VIEW


view : Model -> Browser.Document Msg
view { number } =
    { title = "HMR with BrowserApplication"
    , body = [ body number ]
    }


body : Int -> Html Msg
body number =
    Html.div [ Html.Attributes.id "BrowserApplication" ]
        [ Html.h1 [] [ Html.text "BrowserApplication" ]
        , Html.ol []
            [ Html.li [ Html.Attributes.id "self" ]
                [ Html.text self ]
            , Html.li []
                [ Html.text "number:"
                , Html.span [ Html.Attributes.id "number" ] [ Html.text <| String.fromInt number ]
                ]
            , Html.li [] [ Html.button [ onClick Increment ] [ Html.text "+" ] ]
            , Html.li [] [ Html.button [ onClick IncrementViaPort ] [ Html.text "+ (Port)" ] ]
            , Html.li [] [ changeUrl <| String.fromInt (number + 1) ]
            ]
        ]


changeUrl new =
    Html.a [ Html.Attributes.href <| "#" ++ new ]
        [ Html.text <| "=" ++ new ++ " (URL)" ]


self =
    "#self:0"
